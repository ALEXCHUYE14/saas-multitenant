-- =============================================================================
--  Reportes de ventas
--  Requiere: 20261017000100_credit.sql (sale_items.unit_cost)
--
--  Todas SECURITY INVOKER: corren con los permisos del usuario y RLS limita
--  los datos a su organización. Rango [p_from, p_to). Solo ventas completadas
--  (las anuladas se cuentan aparte). Días agrupados en hora de Lima.
-- =============================================================================

create or replace function public.report_summary(p_from timestamptz, p_to timestamptz)
returns table (
  sales_count   bigint,
  gross         numeric,   -- suma de subtotales (antes de descuentos)
  discounts     numeric,
  net           numeric,   -- lo vendido (total cobrado o fiado)
  credit_total  numeric,   -- parte vendida al fiado
  voided_count  bigint
)
language sql
stable
set search_path = ''
as $$
  select
    count(*) filter (where s.status = 'completed'),
    coalesce(sum(s.subtotal) filter (where s.status = 'completed'), 0),
    coalesce(sum(s.discount) filter (where s.status = 'completed'), 0),
    coalesce(sum(s.total)    filter (where s.status = 'completed'), 0),
    coalesce(sum(s.total)    filter (where s.status = 'completed' and s.payment_method = 'credit'), 0),
    count(*) filter (where s.status = 'voided')
  from public.sales s
  where s.created_at >= p_from and s.created_at < p_to;
$$;

create or replace function public.report_sales_by_day(p_from timestamptz, p_to timestamptz)
returns table (day date, sales_count bigint, total numeric)
language sql
stable
set search_path = ''
as $$
  select (s.created_at at time zone 'America/Lima')::date, count(*), sum(s.total)
  from public.sales s
  where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
  group by 1
  order by 1;
$$;

create or replace function public.report_payment_methods(p_from timestamptz, p_to timestamptz)
returns table (payment_method public.payment_method, sales_count bigint, total numeric)
language sql
stable
set search_path = ''
as $$
  select s.payment_method, count(*), sum(s.total)
  from public.sales s
  where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
  group by 1
  order by 3 desc;
$$;

-- Ranking de productos. El nombre y la unidad son los de la venta más reciente.
-- cost / revenue_with_cost solo consideran líneas con costo conocido.
create or replace function public.report_top_products(p_from timestamptz, p_to timestamptz, p_limit integer default 20)
returns table (
  product_id         uuid,
  product_name       text,
  unit               public.product_unit,
  quantity           numeric,
  revenue            numeric,
  cost               numeric,
  revenue_with_cost  numeric
)
language sql
stable
set search_path = ''
as $$
  select
    si.product_id,
    (array_agg(si.product_name order by s.created_at desc))[1],
    (array_agg(si.unit order by s.created_at desc))[1],
    sum(si.quantity),
    sum(si.line_total),
    coalesce(sum(round(si.quantity * si.unit_cost, 2)) filter (where si.unit_cost is not null), 0),
    coalesce(sum(si.line_total) filter (where si.unit_cost is not null), 0)
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
  group by si.product_id
  order by sum(si.line_total) desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- Ganancia bruta estimada del periodo (todas las líneas, no solo el top).
create or replace function public.report_profit(p_from timestamptz, p_to timestamptz)
returns table (revenue numeric, revenue_with_cost numeric, cost numeric)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(sum(si.line_total), 0),
    coalesce(sum(si.line_total) filter (where si.unit_cost is not null), 0),
    coalesce(sum(round(si.quantity * si.unit_cost, 2)) filter (where si.unit_cost is not null), 0)
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to;
$$;

create or replace function public.report_by_seller(p_from timestamptz, p_to timestamptz)
returns table (seller_id uuid, sales_count bigint, total numeric)
language sql
stable
set search_path = ''
as $$
  select s.created_by, count(*), sum(s.total)
  from public.sales s
  where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
  group by 1
  order by 3 desc;
$$;

revoke all on function public.report_summary(timestamptz, timestamptz)                 from public, anon;
revoke all on function public.report_sales_by_day(timestamptz, timestamptz)            from public, anon;
revoke all on function public.report_payment_methods(timestamptz, timestamptz)         from public, anon;
revoke all on function public.report_top_products(timestamptz, timestamptz, integer)   from public, anon;
revoke all on function public.report_profit(timestamptz, timestamptz)                  from public, anon;
revoke all on function public.report_by_seller(timestamptz, timestamptz)               from public, anon;
grant execute on function public.report_summary(timestamptz, timestamptz)              to authenticated;
grant execute on function public.report_sales_by_day(timestamptz, timestamptz)         to authenticated;
grant execute on function public.report_payment_methods(timestamptz, timestamptz)      to authenticated;
grant execute on function public.report_top_products(timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.report_profit(timestamptz, timestamptz)               to authenticated;
grant execute on function public.report_by_seller(timestamptz, timestamptz)            to authenticated;
