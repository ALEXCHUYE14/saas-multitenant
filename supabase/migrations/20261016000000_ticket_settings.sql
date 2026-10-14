-- =============================================================================
--  Datos del negocio para el ticket impreso (nota de venta)
--  Requiere: 20261013000000_multitenant_core.sql
--  Los edita owner/admin (política "org: admins update own org" ya existente).
-- =============================================================================

alter table public.organizations
  add column tax_id        text check (tax_id is null or tax_id ~ '^[0-9]{11}$'),              -- RUC
  add column address       text check (address is null or char_length(address) between 1 and 160),
  add column phone         text check (phone is null or char_length(phone) between 1 and 30),
  add column ticket_footer text check (ticket_footer is null or char_length(ticket_footer) between 1 and 200);

grant update (tax_id, address, phone, ticket_footer) on public.organizations to authenticated;
