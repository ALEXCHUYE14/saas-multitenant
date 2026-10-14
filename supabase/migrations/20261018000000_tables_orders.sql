-- =============================================================================
--  Módulo: Mesas y pedidos (restaurantes)
--  Requiere: 20261017000100_credit.sql (usa create_sale con fiado y costo)
--
--  Reglas:
--   - Mesas: las gestiona owner/admin. No se borran (historial): se desactivan.
--   - Una sola cuenta abierta por mesa (índice único parcial).
--   - Pedidos e ítems solo cambian vía funciones; cualquier miembro atiende.
--   - Cancelar un pedido con ítems: owner/admin con motivo.
--   - Cobrar reutiliza public.create_sale (precios del servidor, stock, caja,
--     numeración): no hay una segunda lógica de cobro.
-- =============================================================================

create type public.order_status as enum ('open', 'paid', 'canceled');

-- -----------------------------------------------------------------------------
-- Mesas
-- -----------------------------------------------------------------------------
create table public.dining_tables (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default private.current_org_id()
                   references public.organizations (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 30),
  sort_order       integer not null default 0 check (sort_order between 0 and 9999),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),

  constraint dining_tables_org_name_key unique (organization_id, name)
);

create index dining_tables_org_idx on public.dining_tables (organization_id, sort_order, name);

alter table public.dining_tables enable row level security;
revoke all on public.dining_tables from anon;

create policy "dining_tables: members read"
  on public.dining_tables for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "dining_tables: admins insert"
  on public.dining_tables for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and (select private.has_org_role('{owner,admin}')));

create policy "dining_tables: admins update"
  on public.dining_tables for update to authenticated
  using      (organization_id = (select private.current_org_id()) and (select private.has_org_role('{owner,admin}')))
  with check (organization_id = (select private.current_org_id()) and (select private.has_org_role('{owner,admin}')));

revoke insert, update, delete on public.dining_tables from authenticated;
grant insert (name, sort_order) on public.dining_tables to authenticated;
grant update (name, sort_order, active) on public.dining_tables to authenticated;

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  table_id         uuid references public.dining_tables (id),
  label            text check (label is null or char_length(label) between 1 and 40),
  status           public.order_status not null default 'open',
  opened_by        uuid references auth.users (id) on delete set null,
  opened_at        timestamptz not null default now(),
  closed_by        uuid references auth.users (id) on delete set null,
  closed_at        timestamptz,
  sale_id          uuid references public.sales (id),
  cancel_reason    text check (cancel_reason is null or char_length(cancel_reason) <= 200),

  constraint orders_closed_consistent check ((status = 'open') = (closed_at is null)),
  constraint orders_paid_has_sale check ((status = 'paid') = (sale_id is not null))
);

create unique index orders_one_open_per_table on public.orders (table_id)
  where status = 'open' and table_id is not null;
create index orders_org_open_idx on public.orders (organization_id, opened_at) where status = 'open';

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       uuid not null references public.products (id),
  quantity         numeric(12,3) not null check (quantity > 0 and quantity < 1000000),
  note             text check (note is null or char_length(note) between 1 and 120),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id, created_at);

alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
revoke all on public.orders, public.order_items from anon;
revoke insert, update, delete on public.orders, public.order_items from authenticated;

create policy "orders: members read"
  on public.orders for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "order_items: members read"
  on public.order_items for select to authenticated
  using (organization_id = (select private.current_org_id()));

-- -----------------------------------------------------------------------------
-- Helpers internos
-- -----------------------------------------------------------------------------
-- Bloquea un pedido abierto de la organización (o lanza error).
create or replace function private.lock_open_order(p_org uuid, p_order_id uuid)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order
  from public.orders
  where id = p_order_id and organization_id = p_org
  for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'open' then
    raise exception 'order_closed' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

-- Valida una cantidad para la unidad del producto.
create or replace function private.valid_quantity(p_unit public.product_unit, p_qty numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_qty is not null and p_qty > 0 and p_qty < 1000000
     and p_qty = round(p_qty, 3)
     and (p_unit not in ('unit', 'service') or p_qty = trunc(p_qty));
$$;

revoke all on function private.lock_open_order(uuid, uuid)                   from public, anon, authenticated;
revoke all on function private.valid_quantity(public.product_unit, numeric)  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Abrir pedido (en una mesa o sin mesa, p. ej. "Para llevar")
-- -----------------------------------------------------------------------------
create or replace function public.open_order(p_table_id uuid default null, p_label text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := private.current_org_id();
  v_order public.orders;
begin
  if v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_table_id is not null and not exists (
    select 1 from public.dining_tables where id = p_table_id and organization_id = v_org and active
  ) then
    raise exception 'table_not_found' using errcode = 'P0002';
  end if;

  begin
    insert into public.orders (organization_id, table_id, label, opened_by)
    values (v_org, p_table_id, left(nullif(btrim(p_label), ''), 40), auth.uid())
    returning * into v_order;
  exception when unique_violation then
    raise exception 'table_busy' using errcode = 'P0001';
  end;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Agregar ítem (si ya hay una línea del mismo producto y misma nota, suma)
-- -----------------------------------------------------------------------------
create or replace function public.add_order_item(
  p_order_id   uuid,
  p_product_id uuid,
  p_quantity   numeric default 1,
  p_note       text default null
)
returns public.order_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := private.current_org_id();
  v_unit  public.product_unit;
  v_note  text := left(nullif(btrim(p_note), ''), 120);
  v_item  public.order_items;
begin
  if v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform private.lock_open_order(v_org, p_order_id);

  select unit into v_unit
  from public.products
  where id = p_product_id and organization_id = v_org and active;

  if not found then
    raise exception 'product_unavailable' using errcode = 'P0002';
  end if;

  if not private.valid_quantity(v_unit, p_quantity) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  update public.order_items
     set quantity = quantity + p_quantity
   where order_id = p_order_id and product_id = p_product_id and note is not distinct from v_note
  returning * into v_item;

  if not found then
    insert into public.order_items (organization_id, order_id, product_id, quantity, note, created_by)
    values (v_org, p_order_id, p_product_id, p_quantity, v_note, auth.uid())
    returning * into v_item;
  elsif not private.valid_quantity(v_unit, v_item.quantity) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  return v_item;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cambiar cantidad de un ítem (0 = quitarlo)
-- -----------------------------------------------------------------------------
create or replace function public.set_order_item_quantity(p_item_id uuid, p_quantity numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := private.current_org_id();
  v_item public.order_items;
  v_unit public.product_unit;
begin
  if v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_item from public.order_items where id = p_item_id and organization_id = v_org;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  perform private.lock_open_order(v_org, v_item.order_id);

  if p_quantity = 0 then
    delete from public.order_items where id = p_item_id;
    return;
  end if;

  select unit into v_unit from public.products where id = v_item.product_id;
  if not private.valid_quantity(v_unit, p_quantity) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  update public.order_items set quantity = p_quantity where id = p_item_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Mover el pedido a otra mesa (o dejarlo sin mesa)
-- -----------------------------------------------------------------------------
create or replace function public.move_order(p_order_id uuid, p_table_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := private.current_org_id();
  v_order public.orders;
begin
  if v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform private.lock_open_order(v_org, p_order_id);

  if p_table_id is not null and not exists (
    select 1 from public.dining_tables where id = p_table_id and organization_id = v_org and active
  ) then
    raise exception 'table_not_found' using errcode = 'P0002';
  end if;

  begin
    update public.orders set table_id = p_table_id where id = p_order_id
    returning * into v_order;
  exception when unique_violation then
    raise exception 'table_busy' using errcode = 'P0001';
  end;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancelar pedido. Vacío: cualquier miembro. Con ítems: owner/admin + motivo.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := private.current_org_id();
  v_order public.orders;
begin
  if v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform private.lock_open_order(v_org, p_order_id);

  if exists (select 1 from public.order_items where order_id = p_order_id) then
    if not private.has_org_role('{owner,admin}') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if p_reason is null or char_length(btrim(p_reason)) < 3 then
      raise exception 'reason_required' using errcode = '22023';
    end if;
  end if;

  update public.orders
     set status = 'canceled', closed_at = now(), closed_by = auth.uid(),
         cancel_reason = left(nullif(btrim(p_reason), ''), 200)
   where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cobrar pedido: arma los ítems y llama a create_sale (misma lógica que Vender).
-- -----------------------------------------------------------------------------
create or replace function public.pay_order(
  p_order_id        uuid,
  p_payment_method  public.payment_method,
  p_amount_received numeric default null,
  p_discount        numeric default 0,
  p_customer_id     uuid default null
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := private.current_org_id();
  v_order public.orders;
  v_items jsonb;
  v_sale  public.sales;
  v_label text;
begin
  if v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_order := private.lock_open_order(v_org, p_order_id);

  -- Agrupa por producto: create_sale admite hasta 200 líneas.
  select jsonb_agg(jsonb_build_object('product_id', x.product_id, 'quantity', x.q))
    into v_items
  from (select product_id, sum(quantity) as q
        from public.order_items
        where order_id = p_order_id
        group by product_id) x;

  if v_items is null then
    raise exception 'order_empty' using errcode = 'P0001';
  end if;

  select coalesce(t.name, v_order.label) into v_label
  from (select 1) d
  left join public.dining_tables t on t.id = v_order.table_id;

  v_sale := public.create_sale(
    v_items, p_payment_method, p_amount_received, p_discount, p_customer_id,
    case when v_label is null then null else 'Pedido ' || v_label end
  );

  update public.orders
     set status = 'paid', sale_id = v_sale.id, closed_at = now(), closed_by = auth.uid()
   where id = p_order_id;

  return v_sale;
end;
$$;

revoke all on function public.open_order(uuid, text)                                                    from public, anon;
revoke all on function public.add_order_item(uuid, uuid, numeric, text)                                 from public, anon;
revoke all on function public.set_order_item_quantity(uuid, numeric)                                    from public, anon;
revoke all on function public.move_order(uuid, uuid)                                                    from public, anon;
revoke all on function public.cancel_order(uuid, text)                                                  from public, anon;
revoke all on function public.pay_order(uuid, public.payment_method, numeric, numeric, uuid)            from public, anon;
grant execute on function public.open_order(uuid, text)                                                 to authenticated;
grant execute on function public.add_order_item(uuid, uuid, numeric, text)                              to authenticated;
grant execute on function public.set_order_item_quantity(uuid, numeric)                                 to authenticated;
grant execute on function public.move_order(uuid, uuid)                                                 to authenticated;
grant execute on function public.cancel_order(uuid, text)                                               to authenticated;
grant execute on function public.pay_order(uuid, public.payment_method, numeric, numeric, uuid)         to authenticated;
