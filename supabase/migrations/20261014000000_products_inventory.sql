-- =============================================================================
--  Módulo: Productos e inventario
--  Requiere: 20261013000000_multitenant_core.sql
--
--  Reglas:
--   - products.stock NO se edita directamente: solo cambia vía adjust_stock()
--     (y más adelante vía las ventas). Cada cambio deja un stock_movements.
--   - Crear/editar/borrar productos y ajustar stock: owner/admin.
--     Todo el equipo puede leer (lo necesita para vender).
--   - Unidad 'unit' solo admite cantidades enteras; 'service' no lleva stock.
-- =============================================================================

create type public.product_unit as enum ('unit', 'kg', 'l', 'service');
create type public.stock_movement_kind as enum ('initial', 'purchase', 'waste', 'adjustment', 'sale', 'sale_void');

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default private.current_org_id()
                   references public.organizations (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  code             text check (code is null or char_length(code) between 1 and 40),   -- SKU / código de barras
  category         text check (category is null or char_length(category) between 1 and 60),
  unit             public.product_unit not null default 'unit',
  price            numeric(12,2) not null check (price >= 0),
  cost             numeric(12,2) check (cost is null or cost >= 0),
  track_stock      boolean not null default true,
  stock            numeric(12,3) not null default 0,       -- puede quedar negativo: no bloquea una venta
  min_stock        numeric(12,3) check (min_stock is null or min_stock >= 0),
  low_stock        boolean generated always as (track_stock and min_stock is not null and stock <= min_stock) stored,
  active           boolean not null default true,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint products_service_no_stock check (unit <> 'service' or not track_stock),
  constraint products_unit_whole check (
    unit <> 'unit' or (stock = trunc(stock) and (min_stock is null or min_stock = trunc(min_stock)))
  )
);

create index products_org_name_idx on public.products (organization_id, name);
create index products_org_category_idx on public.products (organization_id, category);
create index products_org_low_stock_idx on public.products (organization_id) where low_stock;
create unique index products_org_code_uidx on public.products (organization_id, code) where code is not null;

create trigger products_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

alter table public.products enable row level security;
revoke all on public.products from anon;

create policy "products: members read"
  on public.products for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "products: admins insert"
  on public.products for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and (select private.has_org_role('{owner,admin}')));

create policy "products: admins update"
  on public.products for update to authenticated
  using      (organization_id = (select private.current_org_id()) and (select private.has_org_role('{owner,admin}')))
  with check (organization_id = (select private.current_org_id()) and (select private.has_org_role('{owner,admin}')));

create policy "products: admins delete"
  on public.products for delete to authenticated
  using (organization_id = (select private.current_org_id())
         and (select private.has_org_role('{owner,admin}')));

-- Privilegios por columna: organization_id lo pone la BD; stock solo se fija al crear.
revoke insert, update on public.products from authenticated;
grant insert (name, code, category, unit, price, cost, track_stock, stock, min_stock, active)
  on public.products to authenticated;
grant update (name, code, category, unit, price, cost, track_stock, min_stock, active)
  on public.products to authenticated;

-- -----------------------------------------------------------------------------
-- stock_movements (kardex). Solo lectura para la app: se escribe vía funciones.
-- -----------------------------------------------------------------------------
create table public.stock_movements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  product_id       uuid not null references public.products (id) on delete cascade,
  kind             public.stock_movement_kind not null,
  quantity         numeric(12,3) not null check (quantity <> 0),   -- con signo: + entra, − sale
  stock_after      numeric(12,3) not null,
  note             text check (note is null or char_length(note) <= 200),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index stock_movements_product_idx on public.stock_movements (organization_id, product_id, created_at desc);

alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon;
revoke insert, update, delete on public.stock_movements from authenticated;

create policy "stock_movements: members read"
  on public.stock_movements for select to authenticated
  using (organization_id = (select private.current_org_id()));

-- -----------------------------------------------------------------------------
-- Stock inicial: si se crea un producto con stock ≠ 0, queda en el kardex.
-- -----------------------------------------------------------------------------
create or replace function private.products_initial_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.track_stock and new.stock <> 0 then
    insert into public.stock_movements (organization_id, product_id, kind, quantity, stock_after, created_by)
    values (new.organization_id, new.id, 'initial', new.stock, new.stock, auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function private.products_initial_stock() from public, anon, authenticated;

create trigger products_initial_stock
  after insert on public.products
  for each row execute function private.products_initial_stock();

-- -----------------------------------------------------------------------------
-- adjust_stock: única vía manual para mover stock (owner/admin).
--   purchase   → p_quantity > 0, suma
--   waste      → p_quantity > 0, resta (merma, vencido, consumo interno)
--   adjustment → p_quantity = stock contado (≥ 0); se registra la diferencia
-- -----------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_kind       public.stock_movement_kind,
  p_quantity   numeric,
  p_note       text default null
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := private.current_org_id();
  v_p     public.products;
  v_delta numeric;
begin
  if v_org is null or not private.has_org_role('{owner,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_kind not in ('purchase', 'waste', 'adjustment') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity < 0 or p_quantity >= 1000000000
     or p_quantity <> round(p_quantity, 3) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  select * into v_p
  from public.products
  where id = p_product_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  if not v_p.track_stock then
    raise exception 'stock_not_tracked' using errcode = 'P0001';
  end if;

  if v_p.unit = 'unit' and p_quantity <> trunc(p_quantity) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  v_delta := case p_kind
    when 'purchase' then p_quantity
    when 'waste'    then -p_quantity
    else p_quantity - v_p.stock
  end;

  if v_delta = 0 then
    raise exception 'no_change' using errcode = 'P0001';
  end if;

  update public.products set stock = stock + v_delta
  where id = v_p.id
  returning * into v_p;

  insert into public.stock_movements (organization_id, product_id, kind, quantity, stock_after, note, created_by)
  values (v_org, v_p.id, p_kind, v_delta, v_p.stock, left(nullif(btrim(p_note), ''), 200), auth.uid());

  return v_p;
end;
$$;

revoke all on function public.adjust_stock(uuid, public.stock_movement_kind, numeric, text) from public, anon;
grant execute on function public.adjust_stock(uuid, public.stock_movement_kind, numeric, text) to authenticated;
