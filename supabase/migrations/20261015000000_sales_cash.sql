-- =============================================================================
--  Módulo: Ventas y caja
--  Requiere: 20261013000000_multitenant_core.sql, 20261014000000_products_inventory.sql
--
--  Reglas:
--   - Toda venta pertenece a una caja abierta (1 caja abierta por negocio).
--   - Los precios SIEMPRE salen de products: el cliente solo envía
--     product_id + cantidad. Venta, ítems, stock y kardex en una transacción.
--   - Numeración correlativa por negocio sin huecos por concurrencia.
--   - Descuentos y anulaciones: owner/admin. Solo se anula con la caja abierta.
--   - Sin escrituras directas: todo vía funciones SECURITY DEFINER.
-- =============================================================================

create type public.payment_method as enum ('cash', 'yape', 'plin', 'card', 'transfer');
create type public.sale_status as enum ('completed', 'voided');

-- -----------------------------------------------------------------------------
-- Cajas (turnos)
-- -----------------------------------------------------------------------------
create table public.cash_sessions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  opened_by        uuid references auth.users (id) on delete set null,
  opened_at        timestamptz not null default now(),
  opening_amount   numeric(12,2) not null check (opening_amount >= 0),
  closed_by        uuid references auth.users (id) on delete set null,
  closed_at        timestamptz,
  expected_cash    numeric(12,2),
  counted_cash     numeric(12,2) check (counted_cash is null or counted_cash >= 0),
  note             text check (note is null or char_length(note) <= 300),

  constraint cash_sessions_close_consistent check (
    (closed_at is null) = (expected_cash is null) and (closed_at is null) = (counted_cash is null)
  )
);

create unique index cash_sessions_one_open on public.cash_sessions (organization_id) where closed_at is null;
create index cash_sessions_org_opened_idx on public.cash_sessions (organization_id, opened_at desc);

-- -----------------------------------------------------------------------------
-- Contador de numeración por negocio (sin acceso desde la API)
-- -----------------------------------------------------------------------------
create table public.org_counters (
  organization_id   uuid primary key references public.organizations (id) on delete cascade,
  last_sale_number  integer not null default 0
);

-- -----------------------------------------------------------------------------
-- Ventas
-- -----------------------------------------------------------------------------
create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  number           integer not null,
  cash_session_id  uuid not null references public.cash_sessions (id),
  customer_id      uuid references public.customers (id) on delete set null,
  status           public.sale_status not null default 'completed',
  payment_method   public.payment_method not null,
  subtotal         numeric(12,2) not null check (subtotal >= 0),
  discount         numeric(12,2) not null default 0 check (discount >= 0),
  total            numeric(12,2) not null,
  amount_received  numeric(12,2),
  change_given     numeric(12,2),
  note             text check (note is null or char_length(note) <= 200),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  voided_at        timestamptz,
  voided_by        uuid references auth.users (id) on delete set null,
  void_reason      text check (void_reason is null or char_length(void_reason) <= 200),

  constraint sales_org_number_key unique (organization_id, number),
  constraint sales_total_check check (discount <= subtotal and total = subtotal - discount),
  constraint sales_cash_check check (
    case when payment_method = 'cash'
      then amount_received is not null and amount_received >= total and change_given = amount_received - total
      else amount_received is null and change_given is null
    end
  ),
  constraint sales_void_consistent check ((status = 'voided') = (voided_at is not null))
);

create index sales_org_created_idx on public.sales (organization_id, created_at desc);
create index sales_session_idx on public.sales (cash_session_id);
create index sales_customer_idx on public.sales (customer_id) where customer_id is not null;

create table public.sale_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  sale_id          uuid not null references public.sales (id) on delete cascade,
  product_id       uuid not null references public.products (id),   -- impide borrar productos vendidos
  product_name     text not null,                                   -- copia: el ticket no cambia si renombran
  unit             public.product_unit not null,
  quantity         numeric(12,3) not null check (quantity > 0),
  unit_price       numeric(12,2) not null check (unit_price >= 0),
  line_total       numeric(12,2) not null check (line_total >= 0),
  stock_moved      boolean not null                                 -- si descontó stock (para revertir al anular)
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

-- -----------------------------------------------------------------------------
-- RLS: lectura para miembros; escritura solo vía funciones.
-- -----------------------------------------------------------------------------
alter table public.cash_sessions enable row level security;
alter table public.org_counters  enable row level security;
alter table public.sales         enable row level security;
alter table public.sale_items    enable row level security;

revoke all on public.cash_sessions, public.org_counters, public.sales, public.sale_items from anon;
revoke all on public.org_counters from authenticated;
revoke insert, update, delete on public.cash_sessions, public.sales, public.sale_items from authenticated;

create policy "cash_sessions: members read"
  on public.cash_sessions for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "sales: members read"
  on public.sales for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "sale_items: members read"
  on public.sale_items for select to authenticated
  using (organization_id = (select private.current_org_id()));

-- -----------------------------------------------------------------------------
-- Abrir caja
-- -----------------------------------------------------------------------------
create or replace function public.open_cash_session(p_opening_amount numeric)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
  v_s   public.cash_sessions;
begin
  if v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_opening_amount is null or p_opening_amount < 0 or p_opening_amount >= 1000000000
     or p_opening_amount <> round(p_opening_amount, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  begin
    insert into public.cash_sessions (organization_id, opened_by, opening_amount)
    values (v_org, auth.uid(), p_opening_amount)
    returning * into v_s;
  exception when unique_violation then
    raise exception 'session_already_open' using errcode = 'P0001';
  end;

  return v_s;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cerrar caja: calcula el efectivo esperado con las ventas ya confirmadas.
-- FOR UPDATE espera a que terminen las ventas en curso (que toman FOR SHARE).
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

  select v_s.opening_amount + coalesce(sum(s.total), 0) into v_expected
  from public.sales s
  where s.cash_session_id = v_s.id and s.status = 'completed' and s.payment_method = 'cash';

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
-- Registrar venta
--   p_items: [{"product_id": "<uuid>", "quantity": 1.5}, ...]
--   Ítems repetidos del mismo producto se suman en una línea.
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

  -- Cantidades (ya agrupadas por producto): > 0, máx. 3 decimales.
  if exists (
    select 1
    from (select sum((e ->> 'quantity')::numeric) as q
          from jsonb_array_elements(p_items) e
          group by (e ->> 'product_id')::uuid) x
    where x.q <= 0 or x.q >= 1000000 or x.q <> round(x.q, 3)
  ) or exists (
    select 1 from jsonb_array_elements(p_items) e where (e ->> 'quantity')::numeric <= 0
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

  insert into public.sale_items (organization_id, sale_id, product_id, product_name, unit, quantity, unit_price, line_total, stock_moved)
  select v_org, v_sale.id, p.id, p.name, p.unit, x.q, p.price, round(x.q * p.price, 2), p.track_stock
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

-- -----------------------------------------------------------------------------
-- Anular venta (owner/admin, con su caja aún abierta). Devuelve el stock.
-- -----------------------------------------------------------------------------
create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := private.current_org_id();
  v_uid    uuid := auth.uid();
  v_sale   public.sales;
  v_item   record;
  v_after  numeric;
begin
  if v_org is null or not private.has_org_role('{owner,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;

  if v_sale.status = 'voided' then
    raise exception 'already_voided' using errcode = 'P0001';
  end if;

  perform 1 from public.cash_sessions
  where id = v_sale.cash_session_id and closed_at is null
  for share;

  if not found then
    raise exception 'session_closed' using errcode = 'P0001';
  end if;

  perform 1 from public.products
  where id in (select product_id from public.sale_items where sale_id = v_sale.id and stock_moved)
  order by id
  for update;

  for v_item in
    select si.product_id, si.quantity
    from public.sale_items si
    where si.sale_id = v_sale.id and si.stock_moved
    order by si.product_id
  loop
    update public.products set stock = stock + v_item.quantity
    where id = v_item.product_id
    returning stock into v_after;

    insert into public.stock_movements (organization_id, product_id, kind, quantity, stock_after, note, created_by)
    values (v_org, v_item.product_id, 'sale_void', v_item.quantity, v_after, 'Anulación venta #' || v_sale.number, v_uid);
  end loop;

  update public.sales
     set status = 'voided', voided_at = now(), voided_by = v_uid, void_reason = left(btrim(p_reason), 200)
   where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

-- -----------------------------------------------------------------------------
-- Resumen de una caja por medio de pago (SECURITY INVOKER: respeta RLS).
-- -----------------------------------------------------------------------------
create or replace function public.cash_session_summary(p_session_id uuid)
returns table (payment_method public.payment_method, sales_count bigint, total numeric)
language sql
stable
set search_path = ''
as $$
  select s.payment_method, count(*), sum(s.total)
  from public.sales s
  where s.cash_session_id = p_session_id and s.status = 'completed'
  group by s.payment_method
  order by s.payment_method;
$$;

-- Totales de ventas confirmadas en un rango [p_from, p_to) (SECURITY INVOKER: respeta RLS).
create or replace function public.sales_summary(p_from timestamptz, p_to timestamptz)
returns table (sales_count bigint, total numeric)
language sql
stable
set search_path = ''
as $$
  select count(*), coalesce(sum(s.total), 0)
  from public.sales s
  where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to;
$$;

revoke all on function public.sales_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.sales_summary(timestamptz, timestamptz) to authenticated;

revoke all on function public.open_cash_session(numeric)                                                        from public, anon;
revoke all on function public.close_cash_session(uuid, numeric, text)                                           from public, anon;
revoke all on function public.create_sale(jsonb, public.payment_method, numeric, numeric, uuid, text)           from public, anon;
revoke all on function public.void_sale(uuid, text)                                                             from public, anon;
revoke all on function public.cash_session_summary(uuid)                                                        from public, anon;
grant execute on function public.open_cash_session(numeric)                                                     to authenticated;
grant execute on function public.close_cash_session(uuid, numeric, text)                                        to authenticated;
grant execute on function public.create_sale(jsonb, public.payment_method, numeric, numeric, uuid, text)        to authenticated;
grant execute on function public.void_sale(uuid, text)                                                          to authenticated;
grant execute on function public.cash_session_summary(uuid)                                                     to authenticated;
