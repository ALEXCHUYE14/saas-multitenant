-- =============================================================================
--  Fiados (2/2): ventas al crédito y abonos de clientes
--  Requiere: 20261015000000_sales_cash.sql y 20261017000000_credit_enum.sql
--
--  Reglas:
--   - Deuda del cliente = ventas 'credit' completadas − abonos no anulados.
--     Se calcula siempre; no hay un saldo editable que pueda descuadrarse.
--   - Venta 'credit' exige cliente. No suma al efectivo de la caja.
--   - Abono: monto > 0 y ≤ deuda (cliente bloqueado durante el registro).
--     En efectivo exige caja abierta y entra al cuadre de esa caja.
--   - Un cliente con ventas o abonos no se puede borrar.
--   - Además: sale_items.unit_cost guarda el costo al vender (para reportes).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ajustes a ventas
-- -----------------------------------------------------------------------------
-- Antes: on delete set null. Ahora impide borrar clientes con ventas (perdería la deuda).
alter table public.sales drop constraint sales_customer_id_fkey;
alter table public.sales
  add constraint sales_customer_id_fkey foreign key (customer_id) references public.customers (id);

alter table public.sales
  add constraint sales_credit_customer check (payment_method <> 'credit' or customer_id is not null);

create index sales_credit_customer_idx on public.sales (customer_id)
  where payment_method = 'credit' and status = 'completed';

-- Costo unitario al momento de la venta (null si el producto no tenía costo).
alter table public.sale_items
  add column unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0);

-- -----------------------------------------------------------------------------
-- Abonos de clientes
-- -----------------------------------------------------------------------------
create table public.customer_payments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  customer_id      uuid not null references public.customers (id),
  amount           numeric(12,2) not null check (amount > 0),
  payment_method   public.payment_method not null check (payment_method <> 'credit'),
  cash_session_id  uuid references public.cash_sessions (id),
  note             text check (note is null or char_length(note) <= 200),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  voided_at        timestamptz,
  voided_by        uuid references auth.users (id) on delete set null,
  void_reason      text check (void_reason is null or char_length(void_reason) <= 200),

  constraint customer_payments_cash_session check (payment_method <> 'cash' or cash_session_id is not null),
  constraint customer_payments_void_consistent check ((voided_at is null) = (void_reason is null))
);

create index customer_payments_customer_idx on public.customer_payments (organization_id, customer_id, created_at desc);
create index customer_payments_session_idx on public.customer_payments (cash_session_id) where cash_session_id is not null;

alter table public.customer_payments enable row level security;
revoke all on public.customer_payments from anon;
revoke insert, update, delete on public.customer_payments from authenticated;

create policy "customer_payments: members read"
  on public.customer_payments for select to authenticated
  using (organization_id = (select private.current_org_id()));

-- -----------------------------------------------------------------------------
-- Saldos
-- -----------------------------------------------------------------------------
-- Interno (SECURITY DEFINER lo llama con la org ya validada).
create or replace function private.customer_balance(p_org uuid, p_customer_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select
    coalesce((select sum(s.total) from public.sales s
              where s.organization_id = p_org and s.customer_id = p_customer_id
                and s.payment_method = 'credit' and s.status = 'completed'), 0)
  - coalesce((select sum(p.amount) from public.customer_payments p
              where p.organization_id = p_org and p.customer_id = p_customer_id
                and p.voided_at is null), 0);
$$;

revoke all on function private.customer_balance(uuid, uuid) from public, anon, authenticated;

-- Deuda de un cliente (SECURITY INVOKER: respeta RLS).
create or replace function public.customer_balance(p_customer_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select
    coalesce((select sum(s.total) from public.sales s
              where s.customer_id = p_customer_id and s.payment_method = 'credit' and s.status = 'completed'), 0)
  - coalesce((select sum(p.amount) from public.customer_payments p
              where p.customer_id = p_customer_id and p.voided_at is null), 0);
$$;

-- Clientes con saldo distinto de cero (SECURITY INVOKER).
create or replace function public.customer_debts()
returns table (customer_id uuid, full_name text, phone text, debt numeric, last_credit_at timestamptz)
language sql
stable
set search_path = ''
as $$
  with credit as (
    select s.customer_id, sum(s.total) as total, max(s.created_at) as last_at
    from public.sales s
    where s.payment_method = 'credit' and s.status = 'completed'
    group by s.customer_id
  ),
  paid as (
    select p.customer_id, sum(p.amount) as total
    from public.customer_payments p
    where p.voided_at is null
    group by p.customer_id
  )
  select c.id, c.full_name, c.phone, cr.total - coalesce(pd.total, 0), cr.last_at
  from public.customers c
  join credit cr on cr.customer_id = c.id
  left join paid pd on pd.customer_id = c.id
  where cr.total - coalesce(pd.total, 0) <> 0
  order by 4 desc;
$$;

-- -----------------------------------------------------------------------------
-- Registrar abono
-- -----------------------------------------------------------------------------
create or replace function public.register_customer_payment(
  p_customer_id    uuid,
  p_amount         numeric,
  p_payment_method public.payment_method,
  p_note           text default null
)
returns public.customer_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid := private.current_org_id();
  v_session uuid;
  v_balance numeric;
  v_pay     public.customer_payments;
begin
  if v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_payment_method is null or p_payment_method = 'credit' then
    raise exception 'invalid_payment' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- Bloquea al cliente: dos abonos simultáneos no pueden superar la deuda.
  perform 1 from public.customers
  where id = p_customer_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  v_balance := private.customer_balance(v_org, p_customer_id);
  if v_balance <= 0 then
    raise exception 'no_debt' using errcode = 'P0001';
  end if;
  if p_amount > v_balance then
    raise exception 'exceeds_balance' using errcode = 'P0001';
  end if;

  -- Caja abierta: obligatoria en efectivo (entra al cuadre); si no, solo referencia.
  select id into v_session
  from public.cash_sessions
  where organization_id = v_org and closed_at is null
  for share;

  if p_payment_method = 'cash' and v_session is null then
    raise exception 'no_open_session' using errcode = 'P0001';
  end if;

  insert into public.customer_payments (organization_id, customer_id, amount, payment_method, cash_session_id, note, created_by)
  values (v_org, p_customer_id, p_amount, p_payment_method, v_session, left(nullif(btrim(p_note), ''), 200), auth.uid())
  returning * into v_pay;

  return v_pay;
end;
$$;

-- -----------------------------------------------------------------------------
-- Anular abono (owner/admin). Si fue en efectivo, su caja debe seguir abierta.
-- -----------------------------------------------------------------------------
create or replace function public.void_customer_payment(p_payment_id uuid, p_reason text)
returns public.customer_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
  v_pay public.customer_payments;
begin
  if v_org is null or not private.has_org_role('{owner,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_pay
  from public.customer_payments
  where id = p_payment_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  if v_pay.voided_at is not null then
    raise exception 'already_voided' using errcode = 'P0001';
  end if;

  if v_pay.payment_method = 'cash' then
    perform 1 from public.cash_sessions
    where id = v_pay.cash_session_id and closed_at is null
    for share;
    if not found then
      raise exception 'session_closed' using errcode = 'P0001';
    end if;
  end if;

  update public.customer_payments
     set voided_at = now(), voided_by = auth.uid(), void_reason = left(btrim(p_reason), 200)
   where id = v_pay.id
  returning * into v_pay;

  return v_pay;
end;
$$;

-- -----------------------------------------------------------------------------
-- Abonos de una caja por medio de pago (SECURITY INVOKER).
-- -----------------------------------------------------------------------------
create or replace function public.cash_session_payments_summary(p_session_id uuid)
returns table (payment_method public.payment_method, payments_count bigint, total numeric)
language sql
stable
set search_path = ''
as $$
  select p.payment_method, count(*), sum(p.amount)
  from public.customer_payments p
  where p.cash_session_id = p_session_id and p.voided_at is null
  group by p.payment_method
  order by p.payment_method;
$$;

-- -----------------------------------------------------------------------------
-- Cerrar caja: ahora suma también los abonos en efectivo.
-- -----------------------------------------------------------------------------
create or replace function public.close_cash_session(p_session_id uuid, p_counted_cash numeric, p_note text default null)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid := private.current_org_id();
  v_s        public.cash_sessions;
  v_expected numeric;
begin
  if v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_counted_cash is null or p_counted_cash < 0 or p_counted_cash >= 1000000000
     or p_counted_cash <> round(p_counted_cash, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select * into v_s
  from public.cash_sessions
  where id = p_session_id and organization_id = v_org and closed_at is null
  for update;

  if not found then
    raise exception 'session_not_open' using errcode = 'P0002';
  end if;

  v_expected := v_s.opening_amount
    + coalesce((select sum(s.total) from public.sales s
                where s.cash_session_id = v_s.id and s.status = 'completed' and s.payment_method = 'cash'), 0)
    + coalesce((select sum(p.amount) from public.customer_payments p
                where p.cash_session_id = v_s.id and p.voided_at is null and p.payment_method = 'cash'), 0);

  update public.cash_sessions
     set closed_at     = now(),
         closed_by     = auth.uid(),
         expected_cash = v_expected,
         counted_cash  = p_counted_cash,
         note          = left(nullif(btrim(p_note), ''), 300)
   where id = v_s.id
  returning * into v_s;

  return v_s;
end;
$$;

-- -----------------------------------------------------------------------------
-- Registrar venta: + fiado (exige cliente) + costo unitario en sale_items.
-- -----------------------------------------------------------------------------
create or replace function public.create_sale(
  p_items           jsonb,
  p_payment_method  public.payment_method,
  p_amount_received numeric default null,
  p_discount        numeric default 0,
  p_customer_id     uuid default null,
  p_note            text default null
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid := private.current_org_id();
  v_uid      uuid := auth.uid();
  v_session  uuid;
  v_ids      uuid[];
  v_found    integer;
  v_subtotal numeric;
  v_discount numeric := coalesce(p_discount, 0);
  v_total    numeric;
  v_received numeric;
  v_number   integer;
  v_sale     public.sales;
  v_item     record;
  v_after    numeric;
begin
  if v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_payment_method is null then
    raise exception 'invalid_payment' using errcode = '22023';
  end if;

  if p_payment_method = 'credit' and p_customer_id is null then
    raise exception 'customer_required' using errcode = '22023';
  end if;

  -- Forma del JSON: arreglo de 1..200 objetos {product_id: string, quantity: number}
  -- (IF anidados: SQL no garantiza el orden de evaluación de OR).
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 200
     or exists (
       select 1 from jsonb_array_elements(p_items) e
       where jsonb_typeof(e) is distinct from 'object'
          or jsonb_typeof(e -> 'product_id') is distinct from 'string'
          or jsonb_typeof(e -> 'quantity') is distinct from 'number'
     ) then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  begin
    v_ids := array(select distinct (e ->> 'product_id')::uuid from jsonb_array_elements(p_items) e order by 1);
  exception when invalid_text_representation then
    raise exception 'invalid_items' using errcode = '22023';
  end;

  -- Cantidades: cada línea > 0; agrupadas por producto, < 1.000.000 y máx. 3 decimales.
  if exists (
    select 1 from jsonb_array_elements(p_items) e where (e ->> 'quantity')::numeric <= 0
  ) or exists (
    select 1
    from (select sum((e ->> 'quantity')::numeric) as q
          from jsonb_array_elements(p_items) e
          group by (e ->> 'product_id')::uuid) x
    where x.q >= 1000000 or x.q <> round(x.q, 3)
  ) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  if v_discount < 0 or v_discount <> round(v_discount, 2) then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;
  if v_discount > 0 and not private.has_org_role('{owner,admin}') then
    raise exception 'forbidden_discount' using errcode = '42501';
  end if;

  -- Caja abierta. FOR SHARE: varias ventas a la vez, pero el cierre espera.
  select id into v_session
  from public.cash_sessions
  where organization_id = v_org and closed_at is null
  for share;

  if not found then
    raise exception 'no_open_session' using errcode = 'P0001';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id and organization_id = v_org
  ) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  -- Bloquea los productos en orden fijo (evita deadlocks entre cajas).
  perform 1 from public.products
  where id = any (v_ids) and organization_id = v_org
  order by id
  for update;

  select count(*) into v_found
  from public.products
  where id = any (v_ids) and organization_id = v_org and active;

  if v_found <> cardinality(v_ids) then
    raise exception 'product_unavailable' using errcode = 'P0002';
  end if;

  -- Unidades y servicios: solo cantidades enteras.
  if exists (
    select 1
    from (select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::numeric) as q
          from jsonb_array_elements(p_items) e group by 1) x
    join public.products p on p.id = x.product_id
    where p.unit in ('unit', 'service') and x.q <> trunc(x.q)
  ) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  select sum(round(x.q * p.price, 2)) into v_subtotal
  from (select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::numeric) as q
        from jsonb_array_elements(p_items) e group by 1) x
  join public.products p on p.id = x.product_id;

  if v_discount > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;
  v_total := v_subtotal - v_discount;

  if p_payment_method = 'cash' then
    v_received := coalesce(p_amount_received, v_total);   -- sin monto = pago exacto
    if v_received <> round(v_received, 2) or v_received < v_total or v_received >= 1000000000 then
      raise exception 'insufficient_payment' using errcode = '22023';
    end if;
  else
    v_received := null;
  end if;

  -- Número correlativo: la fila del contador queda bloqueada hasta el COMMIT.
  insert into public.org_counters (organization_id, last_sale_number)
  values (v_org, 1)
  on conflict (organization_id)
    do update set last_sale_number = public.org_counters.last_sale_number + 1
  returning last_sale_number into v_number;

  insert into public.sales (
    organization_id, number, cash_session_id, customer_id, payment_method,
    subtotal, discount, total, amount_received, change_given, note, created_by
  ) values (
    v_org, v_number, v_session, p_customer_id, p_payment_method,
    v_subtotal, v_discount, v_total, v_received,
    case when v_received is null then null else v_received - v_total end,
    left(nullif(btrim(p_note), ''), 200), v_uid
  )
  returning * into v_sale;

  insert into public.sale_items (
    organization_id, sale_id, product_id, product_name, unit, quantity, unit_price, unit_cost, line_total, stock_moved
  )
  select v_org, v_sale.id, p.id, p.name, p.unit, x.q, p.price, p.cost, round(x.q * p.price, 2), p.track_stock
  from (select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::numeric) as q
        from jsonb_array_elements(p_items) e group by 1) x
  join public.products p on p.id = x.product_id
  order by p.id;

  -- Descuenta stock (puede quedar negativo: no bloquea la venta) y deja kardex.
  for v_item in
    select si.product_id, si.quantity
    from public.sale_items si
    where si.sale_id = v_sale.id and si.stock_moved
    order by si.product_id
  loop
    update public.products set stock = stock - v_item.quantity
    where id = v_item.product_id
    returning stock into v_after;

    insert into public.stock_movements (organization_id, product_id, kind, quantity, stock_after, note, created_by)
    values (v_org, v_item.product_id, 'sale', -v_item.quantity, v_after, 'Venta #' || v_number, v_uid);
  end loop;

  return v_sale;
end;
$$;

revoke all on function public.customer_balance(uuid)                                                   from public, anon;
revoke all on function public.customer_debts()                                                         from public, anon;
revoke all on function public.register_customer_payment(uuid, numeric, public.payment_method, text)    from public, anon;
revoke all on function public.void_customer_payment(uuid, text)                                        from public, anon;
revoke all on function public.cash_session_payments_summary(uuid)                                      from public, anon;
grant execute on function public.customer_balance(uuid)                                                to authenticated;
grant execute on function public.customer_debts()                                                      to authenticated;
grant execute on function public.register_customer_payment(uuid, numeric, public.payment_method, text) to authenticated;
grant execute on function public.void_customer_payment(uuid, text)                                     to authenticated;
grant execute on function public.cash_session_payments_summary(uuid)                                   to authenticated;
