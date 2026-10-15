-- =============================================================================
--  Suscripción de la plataforma (S/ 35 al mes por negocio)
--  Requiere: 20261013000000_multitenant_core.sql
--
--  Acceso de un negocio = hasta el mayor de:
--    trial_ends_at (14 días desde el registro)
--    paid_until + 3 días de gracia
--    provisional_until (3 días al reportar un pago manual, mientras se revisa)
--  La regla vive en private.current_org_id(): vencido = RLS no devuelve nada.
--
--  Cobro:
--   - Tarjeta: Mercado Pago Suscripciones. El webhook (service_role) registra
--     cada cobro aprobado y extiende el periodo. Idempotente por id de pago.
--   - Yape / Plin / transferencia: el propietario reporta el pago; un
--     administrador de la plataforma lo aprueba o rechaza.
--
--  Idempotente: se puede ejecutar más de una vez sin error (salta lo que ya existe).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Periodos de acceso
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists trial_ends_at     timestamptz not null default (now() + interval '14 days'),
  add column if not exists paid_until        timestamptz,
  add column if not exists provisional_until timestamptz;

-- Precio mensual en un solo lugar de la BD (la app usa el mismo valor en src/lib/billing.ts).
create or replace function private.billing_price()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 35.00::numeric $$;

create or replace function private.access_until(p_trial timestamptz, p_paid timestamptz, p_provisional timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  -- greatest() ignora los null.
  select greatest(p_trial, p_paid + interval '3 days', p_provisional);
$$;

-- Ahora también exige un periodo vigente. Mismo nombre y firma: todas las
-- políticas RLS existentes pasan a respetar la suscripción automáticamente.
create or replace function private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = (select auth.uid())
    and o.status not in ('suspended', 'canceled')
    and private.access_until(o.trial_ends_at, o.paid_until, o.provisional_until) > now();
$$;

-- Organización del usuario SIN importar si está vencida (para poder pagar).
create or replace function private.member_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.profiles where id = (select auth.uid());
$$;

create or replace function private.is_org_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role = 'owner' and organization_id is not null
                   from public.profiles where id = (select auth.uid())), false);
$$;

grant execute on function private.member_org_id() to authenticated;
grant execute on function private.is_org_owner()  to authenticated;
revoke all on function private.billing_price() from public, anon;
revoke all on function private.access_until(timestamptz, timestamptz, timestamptz) from public, anon;

-- -----------------------------------------------------------------------------
-- 2. Administradores de la plataforma (tú). Esquema privado: invisible para la API.
--    Alta: insert into private.platform_admins (user_id)
--          select id from auth.users where email = 'tu-correo@ejemplo.com';
-- -----------------------------------------------------------------------------
create table if not exists private.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.platform_admins from public, anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.platform_admins where user_id = (select auth.uid()));
$$;

-- -----------------------------------------------------------------------------
-- 3. Suscripciones con tarjeta y pagos
-- -----------------------------------------------------------------------------
do $$
begin
  create type public.billing_method as enum ('card', 'yape', 'plin', 'transfer');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_payment_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists public.billing_subscriptions (
  organization_id          uuid primary key references public.organizations (id) on delete cascade,
  provider_subscription_id text not null unique,          -- id del preapproval de Mercado Pago
  status                   text not null check (char_length(status) <= 30),  -- pending | authorized | paused | cancelled
  payer_email              text check (payer_email is null or char_length(payer_email) <= 254),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

drop trigger if exists billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_updated_at
  before update on public.billing_subscriptions
  for each row execute function private.set_updated_at();

create table if not exists public.billing_payments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  method              public.billing_method not null,
  amount              numeric(10,2) not null check (amount > 0),
  months              integer not null default 1 check (months between 1 and 12),
  status              public.billing_payment_status not null default 'pending',
  provider_payment_id text check (provider_payment_id is null or char_length(provider_payment_id) <= 64),
  operation_number    text check (operation_number is null or operation_number ~ '^[A-Z0-9-]{4,30}$'),
  paid_on             date,
  receipt_path        text check (receipt_path is null or char_length(receipt_path) <= 200),
  period_start        timestamptz,
  period_end          timestamptz,
  reviewed_by         uuid references auth.users (id) on delete set null,
  reviewed_at         timestamptz,
  reject_reason       text check (reject_reason is null or char_length(reject_reason) <= 200),
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),

  constraint billing_payments_card_provider check ((method = 'card') = (provider_payment_id is not null)),
  constraint billing_payments_manual_operation check (method = 'card' or operation_number is not null),
  constraint billing_payments_approved_period check ((status = 'approved') = (period_end is not null))
);

-- Un cobro de Mercado Pago se registra una sola vez (webhooks repetidos).
create unique index if not exists billing_payments_provider_uidx on public.billing_payments (provider_payment_id)
  where provider_payment_id is not null;
-- Un mismo número de operación no puede usarse dos veces (salvo si fue rechazado).
create unique index if not exists billing_payments_operation_uidx on public.billing_payments (method, operation_number)
  where operation_number is not null and status <> 'rejected';
-- Un solo reporte pendiente por negocio.
create unique index if not exists billing_payments_one_pending on public.billing_payments (organization_id)
  where status = 'pending';
create index if not exists billing_payments_org_idx on public.billing_payments (organization_id, created_at desc);

alter table public.billing_subscriptions enable row level security;
alter table public.billing_payments      enable row level security;
revoke all on public.billing_subscriptions, public.billing_payments from anon;
revoke insert, update, delete on public.billing_subscriptions, public.billing_payments from authenticated;

-- Lectura: el propietario (aunque esté vencido) y los administradores de la plataforma.
drop policy if exists "billing_subscriptions: owner or platform admin read" on public.billing_subscriptions;
create policy "billing_subscriptions: owner or platform admin read"
  on public.billing_subscriptions for select to authenticated
  using ((organization_id = (select private.member_org_id()) and (select private.is_org_owner()))
         or (select public.is_platform_admin()));

drop policy if exists "billing_payments: owner or platform admin read" on public.billing_payments;
create policy "billing_payments: owner or platform admin read"
  on public.billing_payments for select to authenticated
  using ((organization_id = (select private.member_org_id()) and (select private.is_org_owner()))
         or (select public.is_platform_admin()));

-- -----------------------------------------------------------------------------
-- 4. Extender el periodo pagado (interno). Los meses se suman al final del
--    periodo vigente (o de la prueba), nunca se pierden días ya pagados.
-- -----------------------------------------------------------------------------
create or replace function private.extend_paid_period(p_org uuid, p_months integer)
returns table (period_start timestamptz, period_end timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_org   public.organizations;
  v_start timestamptz;
begin
  select * into v_org from public.organizations where id = p_org for update;
  if not found then
    raise exception 'org_not_found' using errcode = 'P0002';
  end if;

  v_start := greatest(v_org.paid_until, v_org.trial_ends_at, now());

  update public.organizations
     set paid_until        = v_start + make_interval(months => p_months),
         provisional_until = null,
         -- una suspensión manual no se levanta sola por pagar
         status = case when status in ('suspended', 'canceled') then status else 'active'::public.org_status end
   where id = p_org;

  return query select v_start, v_start + make_interval(months => p_months);
end;
$$;

revoke all on function private.extend_paid_period(uuid, integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Estado de suscripción del usuario actual (funciona aunque esté vencido)
-- -----------------------------------------------------------------------------
create or replace function public.my_billing()
returns table (
  organization_id     uuid,
  name                text,
  slug                text,
  status              public.org_status,
  trial_ends_at       timestamptz,
  paid_until          timestamptz,
  provisional_until   timestamptz,
  access_until        timestamptz,
  has_access          boolean,
  is_owner            boolean,
  subscription_status text,
  pending_payment     boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, o.slug, o.status, o.trial_ends_at, o.paid_until, o.provisional_until,
         private.access_until(o.trial_ends_at, o.paid_until, o.provisional_until),
         o.status not in ('suspended', 'canceled')
           and private.access_until(o.trial_ends_at, o.paid_until, o.provisional_until) > now(),
         p.role = 'owner',
         s.status,
         exists (select 1 from public.billing_payments bp where bp.organization_id = o.id and bp.status = 'pending')
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  left join public.billing_subscriptions s on s.organization_id = o.id
  where p.id = (select auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- 6. Reporte de pago manual (Yape / Plin / transferencia) por el propietario
-- -----------------------------------------------------------------------------
create or replace function public.report_manual_payment(
  p_method           public.billing_method,
  p_operation_number text,
  p_paid_on          date,
  p_amount           numeric,
  p_receipt_path     text default null
)
returns public.billing_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := private.member_org_id();
  v_op     text := upper(btrim(p_operation_number));
  v_today  date := (now() at time zone 'America/Lima')::date;
  v_price  numeric := private.billing_price();
  v_months integer;
  v_pay    public.billing_payments;
begin
  if v_org is null or not private.is_org_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_method is null or p_method = 'card' then
    raise exception 'invalid_method' using errcode = '22023';
  end if;

  if v_op is null or v_op !~ '^[A-Z0-9-]{4,30}$' then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;

  if p_paid_on is null or p_paid_on > v_today or p_paid_on < v_today - 30 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  if p_amount is null or p_amount < v_price or p_amount > v_price * 12 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  v_months := floor(p_amount / v_price)::integer;   -- S/ 70 = 2 meses

  if p_receipt_path is not null and (p_receipt_path not like v_org::text || '/%' or p_receipt_path like '%..%') then
    raise exception 'invalid_receipt' using errcode = '22023';
  end if;

  begin
    insert into public.billing_payments
      (organization_id, method, amount, months, operation_number, paid_on, receipt_path, created_by)
    values
      (v_org, p_method, p_amount, v_months, v_op, p_paid_on, p_receipt_path, auth.uid())
    returning * into v_pay;
  exception when unique_violation then
    if exists (select 1 from public.billing_payments where organization_id = v_org and status = 'pending') then
      raise exception 'pending_exists' using errcode = 'P0001';
    end if;
    raise exception 'operation_used' using errcode = 'P0001';
  end;

  -- Acceso provisional de 3 días mientras se revisa, salvo rechazos recientes.
  if not exists (
    select 1 from public.billing_payments
    where organization_id = v_org and status = 'rejected' and reviewed_at > now() - interval '60 days'
  ) then
    update public.organizations
       set provisional_until = greatest(provisional_until, now() + interval '3 days')
     where id = v_org;
  end if;

  return v_pay;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Cobros con tarjeta (solo el webhook con service_role)
-- -----------------------------------------------------------------------------
create or replace function public.billing_upsert_subscription(
  p_org uuid, p_provider_id text, p_status text, p_payer_email text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.billing_subscriptions (organization_id, provider_subscription_id, status, payer_email)
  values (p_org, p_provider_id, left(p_status, 30), left(p_payer_email, 254))
  on conflict (organization_id) do update
    set provider_subscription_id = excluded.provider_subscription_id,
        status                   = excluded.status,
        payer_email              = coalesce(excluded.payer_email, public.billing_subscriptions.payer_email);
$$;

-- Devuelve true si el cobro era nuevo y se extendió el acceso; false si ya estaba registrado.
create or replace function public.billing_apply_card_payment(
  p_org uuid, p_provider_payment_id text, p_amount numeric, p_paid_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if p_amount is null or p_amount < private.billing_price() then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- period_end es obligatorio para 'approved': se inserta provisorio y se corrige abajo.
  insert into public.billing_payments
    (organization_id, method, amount, months, status, provider_payment_id, paid_on, reviewed_at, period_start, period_end)
  values
    (p_org, 'card', p_amount, 1, 'approved', p_provider_payment_id,
     (coalesce(p_paid_at, now()) at time zone 'America/Lima')::date, now(), now(), now())
  on conflict (provider_payment_id) where provider_payment_id is not null do nothing
  returning id into v_id;

  if v_id is null then
    return false;   -- webhook repetido: ya se contó
  end if;

  select e.period_start, e.period_end into v_start, v_end from private.extend_paid_period(p_org, 1) e;
  update public.billing_payments set period_start = v_start, period_end = v_end where id = v_id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Panel del administrador de la plataforma
-- -----------------------------------------------------------------------------
create or replace function private.assert_platform_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_platform_admin() from public, anon, authenticated;

create or replace function public.admin_review_payment(p_payment_id uuid, p_approve boolean, p_reason text default null)
returns public.billing_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay   public.billing_payments;
  v_start timestamptz;
  v_end   timestamptz;
begin
  perform private.assert_platform_admin();

  select * into v_pay from public.billing_payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;

  if p_approve then
    select e.period_start, e.period_end into v_start, v_end from private.extend_paid_period(v_pay.organization_id, v_pay.months) e;
    update public.billing_payments
       set status = 'approved', period_start = v_start, period_end = v_end, reviewed_by = auth.uid(), reviewed_at = now()
     where id = v_pay.id
    returning * into v_pay;
  else
    if p_reason is null or char_length(btrim(p_reason)) < 3 then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    update public.billing_payments
       set status = 'rejected', reject_reason = left(btrim(p_reason), 200), reviewed_by = auth.uid(), reviewed_at = now()
     where id = v_pay.id
    returning * into v_pay;
    update public.organizations set provisional_until = null where id = v_pay.organization_id;
  end if;

  return v_pay;
end;
$$;

create or replace function public.admin_organizations()
returns table (
  id uuid, name text, slug text, status public.org_status, created_at timestamptz,
  trial_ends_at timestamptz, paid_until timestamptz, provisional_until timestamptz,
  access_until timestamptz, owner_email text, subscription_status text, pending_payments bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
  select o.id, o.name, o.slug, o.status, o.created_at, o.trial_ends_at, o.paid_until, o.provisional_until,
         private.access_until(o.trial_ends_at, o.paid_until, o.provisional_until),
         (select u.email::text from public.profiles p join auth.users u on u.id = p.id
           where p.organization_id = o.id and p.role = 'owner' order by p.created_at limit 1),
         s.status,
         (select count(*) from public.billing_payments bp where bp.organization_id = o.id and bp.status = 'pending')
  from public.organizations o
  left join public.billing_subscriptions s on s.organization_id = o.id
  order by o.created_at desc;
end;
$$;

create or replace function public.admin_pending_payments()
returns table (
  id uuid, organization_id uuid, organization_name text, method public.billing_method, amount numeric,
  months integer, operation_number text, paid_on date, receipt_path text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
  select bp.id, bp.organization_id, o.name, bp.method, bp.amount, bp.months, bp.operation_number,
         bp.paid_on, bp.receipt_path, bp.created_at
  from public.billing_payments bp
  join public.organizations o on o.id = bp.organization_id
  where bp.status = 'pending'
  order by bp.created_at;
end;
$$;

create or replace function public.admin_set_org_status(p_org uuid, p_status public.org_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  if p_status not in ('active', 'suspended') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.organizations set status = p_status where id = p_org;
  if not found then
    raise exception 'org_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Regalar días de prueba (cortesía, soporte).
create or replace function public.admin_extend_trial(p_org uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'invalid_days' using errcode = '22023';
  end if;
  update public.organizations
     set trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => p_days)
   where id = p_org;
  if not found then
    raise exception 'org_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Comprobantes (Storage privado). Ruta: <organization_id>/<archivo>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('billing-receipts', 'billing-receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "billing receipts: owner uploads to own folder" on storage.objects;
create policy "billing receipts: owner uploads to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'billing-receipts'
              and (storage.foldername(name))[1] = (select private.member_org_id())::text
              and (select private.is_org_owner()));

drop policy if exists "billing receipts: owner or platform admin reads" on storage.objects;
create policy "billing receipts: owner or platform admin reads"
  on storage.objects for select to authenticated
  using (bucket_id = 'billing-receipts'
         and ((storage.foldername(name))[1] = (select private.member_org_id())::text
              or (select public.is_platform_admin())));

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke all on function public.is_platform_admin()                                                   from public, anon;
revoke all on function public.my_billing()                                                          from public, anon;
revoke all on function public.report_manual_payment(public.billing_method, text, date, numeric, text) from public, anon;
revoke all on function public.billing_upsert_subscription(uuid, text, text, text)                   from public, anon, authenticated;
revoke all on function public.billing_apply_card_payment(uuid, text, numeric, timestamptz)          from public, anon, authenticated;
revoke all on function public.admin_review_payment(uuid, boolean, text)                             from public, anon;
revoke all on function public.admin_organizations()                                                 from public, anon;
revoke all on function public.admin_pending_payments()                                              from public, anon;
revoke all on function public.admin_set_org_status(uuid, public.org_status)                         from public, anon;
revoke all on function public.admin_extend_trial(uuid, integer)                                     from public, anon;

grant execute on function public.is_platform_admin()                                                   to authenticated;
grant execute on function public.my_billing()                                                          to authenticated;
grant execute on function public.report_manual_payment(public.billing_method, text, date, numeric, text) to authenticated;
grant execute on function public.billing_upsert_subscription(uuid, text, text, text)                   to service_role;
grant execute on function public.billing_apply_card_payment(uuid, text, numeric, timestamptz)          to service_role;
grant execute on function public.admin_review_payment(uuid, boolean, text)                             to authenticated;
grant execute on function public.admin_organizations()                                                 to authenticated;
grant execute on function public.admin_pending_payments()                                              to authenticated;
grant execute on function public.admin_set_org_status(uuid, public.org_status)                         to authenticated;
grant execute on function public.admin_extend_trial(uuid, integer)                                     to authenticated;
