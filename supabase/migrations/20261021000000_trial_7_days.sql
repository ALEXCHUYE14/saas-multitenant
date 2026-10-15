-- =============================================================================
--  Prueba gratis: 7 días (antes 14).
--  Requiere: 20261020000000_billing.sql
--
--  Solo afecta a los negocios que se registren DESDE AHORA. Los que ya están en
--  prueba conservan la fecha que se les prometió (no se les corta el acceso).
--  Idempotente: se puede ejecutar más de una vez.
--
--  La app muestra el mismo valor en src/lib/billing.ts (BILLING.trialDays).
-- =============================================================================

alter table public.organizations
  alter column trial_ends_at set default (now() + interval '7 days');
