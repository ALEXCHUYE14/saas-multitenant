-- =============================================================================
--  SaaS Multi-Tenant B2B · Núcleo de tenancy
--  Supabase / PostgreSQL 15+
--
--  Modelo: 1 usuario pertenece a 1 organización (profiles.organization_id).
--  Aislamiento: RLS en TODAS las tablas de negocio, filtrando por
--  private.current_org_id(), que se resuelve desde el perfil del usuario
--  autenticado (nunca desde datos enviados por el cliente).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Esquema privado (NO expuesto por la API REST de Supabase)
--    Aquí viven las funciones SECURITY DEFINER que usan las políticas RLS.
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------
create type public.org_role   as enum ('owner', 'admin', 'staff');
create type public.org_plan   as enum ('free', 'starter', 'pro', 'enterprise');
create type public.org_status as enum ('trialing', 'active', 'past_due', 'suspended', 'canceled');

-- -----------------------------------------------------------------------------
-- 2. Utilidades
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Slugs reservados: colisionan con rutas de la app o son sensibles.
create or replace function private.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_slug = any (array[
    'admin','api','app','auth','billing','dashboard','docs','help','login',
    'logout','new','onboarding','register','settings','signup','static',
    'status','support','www','mail','root','system'
  ]);
$$;

-- -----------------------------------------------------------------------------
-- 3. Tablas núcleo
-- -----------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  slug        text not null,
  plan        public.org_plan   not null default 'free',
  status      public.org_status not null default 'trialing',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint organizations_slug_key    unique (slug),
  -- 3–48 caracteres, minúsculas, números y guiones; sin guion al inicio/fin.
  constraint organizations_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  constraint organizations_slug_no_double_dash check (slug !~ '--'),
  constraint organizations_slug_not_reserved  check (not private.is_reserved_slug(slug))
);

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();


create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  organization_id  uuid references public.organizations (id) on delete set null,
  full_name        text check (full_name is null or char_length(full_name) <= 120),
  role             public.org_role not null default 'staff',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index profiles_organization_id_idx on public.profiles (organization_id);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();


-- Invitaciones: permiten que un usuario nuevo se una a una organización
-- existente al registrarse (o al aceptar con accept_invitation()).
create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  email            text not null check (email = lower(email)),
  role             public.org_role not null default 'staff' check (role <> 'owner'),
  token            uuid not null unique default gen_random_uuid(),
  invited_by       uuid references auth.users (id) on delete set null,
  expires_at       timestamptz not null default now() + interval '7 days',
  accepted_at      timestamptz,
  created_at       timestamptz not null default now()
);

create unique index invitations_pending_unique
  on public.invitations (organization_id, email)
  where accepted_at is null;
create index invitations_email_idx on public.invitations (email) where accepted_at is null;

-- -----------------------------------------------------------------------------
-- 4. Helpers de contexto para RLS (SECURITY DEFINER → evitan recursión RLS)
--    Se llaman como (select private.fn()) en las políticas para que Postgres
--    los evalúe UNA vez por consulta (initPlan) y no por fila.
-- -----------------------------------------------------------------------------
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
    and o.status not in ('suspended', 'canceled');
$$;

create or replace function private.current_org_role()
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function private.has_org_role(p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_org_role() = any (p_roles), false)
     and private.current_org_id() is not null;
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.current_org_id()               to authenticated;
grant execute on function private.current_org_role()             to authenticated;
grant execute on function private.has_org_role(public.org_role[]) to authenticated;
grant execute on function private.is_reserved_slug(text)         to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.invitations   enable row level security;

-- Nada para anon en tablas núcleo.
revoke all on public.organizations, public.profiles, public.invitations from anon;

-- ---------- organizations ----------
-- Lectura: solo la organización propia.
create policy "org: members read own org"
  on public.organizations for select
  to authenticated
  using (id = (select private.current_org_id()));

-- Edición: solo owner/admin de esa organización.
create policy "org: admins update own org"
  on public.organizations for update
  to authenticated
  using      (id = (select private.current_org_id()) and (select private.has_org_role('{owner,admin}')))
  with check (id = (select private.current_org_id()) and (select private.has_org_role('{owner,admin}')));

-- Sin INSERT/DELETE directos: se crean vía create_organization().
-- Defensa en profundidad: plan/status/slug solo los cambia el backend (service_role).
revoke insert, update, delete on public.organizations from authenticated;
grant  update (name) on public.organizations to authenticated;

-- ---------- profiles ----------
-- Lectura: mi perfil + los perfiles de mi organización.
create policy "profiles: read self and teammates"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or organization_id = (select private.current_org_id())
  );

-- Edición: solo mi propio perfil y solo columnas permitidas (ver GRANT).
create policy "profiles: update self"
  on public.profiles for update
  to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from authenticated;
grant  update (full_name) on public.profiles to authenticated;
-- role y organization_id solo cambian vía RPCs SECURITY DEFINER.

-- ---------- invitations ----------
create policy "invitations: admins read"
  on public.invitations for select
  to authenticated
  using (organization_id = (select private.current_org_id())
         and (select private.has_org_role('{owner,admin}')));

create policy "invitations: admins create"
  on public.invitations for insert
  to authenticated
  with check (organization_id = (select private.current_org_id())
              and (select private.has_org_role('{owner,admin}'))
              and invited_by = (select auth.uid()));

create policy "invitations: admins revoke"
  on public.invitations for delete
  to authenticated
  using (organization_id = (select private.current_org_id())
         and (select private.has_org_role('{owner,admin}')));

revoke update on public.invitations from authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPCs públicas (expuestas como supabase.rpc(...))
-- -----------------------------------------------------------------------------

-- 6.1 ¿Slug disponible? (validación en vivo del onboarding)
create or replace function public.is_slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'
     and p_slug !~ '--'
     and not private.is_reserved_slug(p_slug)
     and not exists (select 1 from public.organizations where slug = p_slug);
$$;

-- 6.2 Crear organización (onboarding). El usuario queda como owner.
create or replace function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organizations;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles
             where id = v_uid and organization_id is not null) then
    raise exception 'already_member' using errcode = 'P0001',
      hint = 'El usuario ya pertenece a una organización.';
  end if;

  begin
    insert into public.organizations (name, slug)
    values (btrim(p_name), lower(btrim(p_slug)))
    returning * into v_org;
  exception
    when unique_violation then
      raise exception 'slug_taken' using errcode = '23505';
    when check_violation then
      raise exception 'invalid_input' using errcode = '23514';
  end;

  insert into public.profiles (id, organization_id, role)
  values (v_uid, v_org.id, 'owner')
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        role            = 'owner';

  return v_org;
end;
$$;

-- 6.3 Aceptar invitación (usuario ya registrado y sin organización).
create or replace function public.accept_invitation(p_token uuid)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_inv   public.invitations;
  v_org   public.organizations;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  select * into v_inv
  from public.invitations
  where token = p_token
    and accepted_at is null
    and expires_at > now()
    and email = v_email
  for update;

  if not found then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.profiles
             where id = v_uid and organization_id is not null) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  update public.profiles
     set organization_id = v_inv.organization_id, role = v_inv.role
   where id = v_uid;

  update public.invitations set accepted_at = now() where id = v_inv.id;

  select * into v_org from public.organizations where id = v_inv.organization_id;
  return v_org;
end;
$$;

-- 6.4 Cambiar rol de un miembro (owner/admin). Reglas:
--     - admin no puede tocar owners ni otorgar 'owner'
--     - no se puede dejar la organización sin owner
create or replace function public.set_member_role(p_member_id uuid, p_role public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org         uuid := private.current_org_id();
  v_actor_role  public.org_role := private.current_org_role();
  v_target_role public.org_role;
begin
  if v_org is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.profiles
  where id = p_member_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if v_actor_role = 'admin' and (v_target_role = 'owner' or p_role = 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_target_role = 'owner' and p_role <> 'owner'
     and (select count(*) from public.profiles
          where organization_id = v_org and role = 'owner') <= 1 then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;

  update public.profiles set role = p_role where id = p_member_id;
end;
$$;

-- 6.5 Quitar a un miembro de la organización.
create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org         uuid := private.current_org_id();
  v_actor_role  public.org_role := private.current_org_role();
  v_target_role public.org_role;
begin
  if v_org is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.profiles
  where id = p_member_id and organization_id = v_org;

  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if v_target_role = 'owner' and v_actor_role <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_target_role = 'owner'
     and (select count(*) from public.profiles
          where organization_id = v_org and role = 'owner') <= 1 then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;

  update public.profiles
     set organization_id = null, role = 'staff'
   where id = p_member_id;
end;
$$;

revoke all on function public.is_slug_available(text)                    from public, anon;
revoke all on function public.create_organization(text, text)            from public, anon;
revoke all on function public.accept_invitation(uuid)                    from public, anon;
revoke all on function public.set_member_role(uuid, public.org_role)     from public, anon;
revoke all on function public.remove_member(uuid)                        from public, anon;
grant execute on function public.is_slug_available(text)                 to authenticated;
grant execute on function public.create_organization(text, text)         to authenticated;
grant execute on function public.accept_invitation(uuid)                 to authenticated;
grant execute on function public.set_member_role(uuid, public.org_role)  to authenticated;
grant execute on function public.remove_member(uuid)                     to authenticated;

-- -----------------------------------------------------------------------------
-- 7. handle_new_user: se ejecuta al crear un registro en auth.users
--    Prioridad:
--      a) Invitación pendiente para su email  → se une a esa organización
--      b) metadata org_name + org_slug         → crea su organización (owner)
--      c) nada                                 → perfil sin org → /onboarding
--    Nunca hace fallar el registro: los errores de org se ignoran y el
--    usuario completa el onboarding manualmente.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full_name text  := nullif(btrim(v_meta ->> 'full_name'), '');
  v_org_name  text  := nullif(btrim(v_meta ->> 'org_name'), '');
  v_org_slug  text  := nullif(lower(btrim(v_meta ->> 'org_slug')), '');
  v_inv       public.invitations;
  v_org_id    uuid;
  v_role      public.org_role := 'staff';
begin
  -- a) Invitación pendiente
  select * into v_inv
  from public.invitations
  where email = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    v_org_id := v_inv.organization_id;
    v_role   := v_inv.role;
    update public.invitations set accepted_at = now() where id = v_inv.id;

  -- b) Crear organización desde metadata del sign-up
  elsif v_org_name is not null and v_org_slug is not null then
    begin
      insert into public.organizations (name, slug)
      values (v_org_name, v_org_slug)
      returning id into v_org_id;
      v_role := 'owner';
    exception when unique_violation or check_violation then
      v_org_id := null;   -- slug ocupado/ inválido → irá a onboarding
    end;
  end if;

  insert into public.profiles (id, organization_id, full_name, role)
  values (new.id, v_org_id, v_full_name, v_role);

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- =============================================================================
-- 8. PLANTILLA para tablas de negocio (copiar este patrón en cada módulo)
--    Ejemplo: customers. organization_id se autocompleta desde la sesión,
--    así el cliente nunca necesita (ni puede) enviar otro tenant.
-- =============================================================================
create table public.customers (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default private.current_org_id()
                   references public.organizations (id) on delete cascade,
  full_name        text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone            text,
  email            text,
  document_id      text,                       -- DNI / RUC
  notes            text,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Índice compuesto que empieza por organization_id: clave para rendimiento RLS.
create index customers_org_created_idx on public.customers (organization_id, created_at desc);
create unique index customers_org_document_uidx
  on public.customers (organization_id, document_id) where document_id is not null;

create trigger customers_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();

alter table public.customers enable row level security;
revoke all on public.customers from anon;

create policy "customers: members read"
  on public.customers for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "customers: members insert"
  on public.customers for insert to authenticated
  with check (organization_id = (select private.current_org_id()));

create policy "customers: members update"
  on public.customers for update to authenticated
  using      (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));

create policy "customers: admins delete"
  on public.customers for delete to authenticated
  using (organization_id = (select private.current_org_id())
         and (select private.has_org_role('{owner,admin}')));
