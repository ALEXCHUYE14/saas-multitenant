-- =============================================================================
--  Fiados (1/2): nuevo medio de pago 'credit'.
--  Va en su propio archivo: PostgreSQL no permite usar un valor nuevo de un
--  enum en la misma transacción en que se agrega. EJECUTAR ANTES del (2/2).
-- =============================================================================

alter type public.payment_method add value if not exists 'credit';
