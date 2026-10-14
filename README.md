# SaaS Multi-Tenant B2B — Next.js 16 + Supabase

Base lista para producción de una plataforma donde cada negocio (lavadero, óptica, bodega, taller…) se registra solo y obtiene un espacio aislado en `/dashboard/<slug>`.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local        # completa URL y anon key de Supabase
# Aplica la migración (CLI) o pégala en el SQL Editor:
npx supabase db push               # o: supabase/migrations/20261013000000_multitenant_core.sql
npm run dev
```

En Supabase → Authentication → URL Configuration agrega `http://localhost:3000/**` (y tu dominio de producción con `/**`) a Redirect URLs.

### Migraciones (en este orden, cada una por separado en el SQL Editor)

| # | Archivo | Módulo |
|---|---|---|
| 1 | `20261013000000_multitenant_core.sql` | Negocios, perfiles, roles, invitaciones, clientes |
| 2 | `20261014000000_products_inventory.sql` | Productos y kardex de stock |
| 3 | `20261015000000_sales_cash.sql` | Ventas y caja |
| 4 | `20261016000000_ticket_settings.sql` | Datos del ticket (RUC, dirección…) |
| 5 | `20261017000000_credit_enum.sql` | Fiados 1/2 — **ejecutar sola** (agrega un valor de enum) |
| 6 | `20261017000100_credit.sql` | Fiados 2/2: abonos, saldos y costo por venta |
| 7 | `20261018000000_tables_orders.sql` | Mesas y pedidos |
| 8 | `20261019000000_reports.sql` | Reportes |

## Arquitectura

```
supabase/migrations/…_multitenant_core.sql   Tablas, RLS, RPCs, trigger handle_new_user
src/proxy.ts                                 Protección de rutas (Next 16: antes middleware.ts)
src/lib/supabase/{server,client,middleware}  Clientes SSR / browser / refresco de sesión
src/lib/tenant.ts                            getTenantContext(slug), assertPermission()
src/lib/permissions.ts                       Matriz rol → permiso (UX)
src/hooks/use-tenant.tsx                     useTenant() en Client Components
src/app/(auth)/login | register              Auth con Server Actions
src/app/onboarding                           Crear negocio + slug, o aceptar invitación
src/app/dashboard/[slug]/…                   Resumen, Clientes, Equipo, Ajustes
src/components/ui | shell                    Design system y layout
```

### Cómo se garantiza el aislamiento

1. **RLS en la base de datos (la autoridad real).** Cada política compara `organization_id` con `private.current_org_id()`, que sale del perfil del usuario autenticado, nunca de datos del cliente. Aunque el front tenga un bug, Postgres no devuelve ni acepta filas de otro tenant.
2. **`organization_id` con DEFAULT de sesión.** En tablas de negocio el cliente no envía el tenant; la BD lo completa y la política `WITH CHECK` rechaza cualquier otro valor.
3. **Privilegios por columna.** `authenticated` solo puede actualizar `organizations.name` y `profiles.full_name`. `plan`, `status`, `role` y `organization_id` solo cambian vía RPCs `SECURITY DEFINER` con reglas (o con `service_role` desde tu backend de facturación).
4. **Validación del slug en el servidor.** `getTenantContext(slug)` devuelve 404 si el slug no es el del usuario (no revela si existe).
5. **Organización suspendida/cancelada** → `current_org_id()` devuelve `null` → sin acceso a datos; la app lo envía a `/suspended`.

Probado contra PostgreSQL 16: lectura/escritura cruzada entre tenants, cambio de `organization_id`, escalada de rol, edición de `plan`, staff invitando o borrando, acceso anónimo y org suspendida — todos bloqueados.

### Flujo de registro (`handle_new_user`)

| Caso | Resultado |
|---|---|
| Hay invitación pendiente para su email | Se une a esa organización con el rol invitado |
| Indicó nombre de negocio en el registro | Se crea la organización y queda como `owner` |
| Ninguno (o slug ocupado) | Perfil sin org → `/onboarding` |

### Agregar un módulo nuevo (ventas, citas, inventario…)

Copia el bloque **8. PLANTILLA** de la migración (`customers`): columna `organization_id ... default private.current_org_id()`, índice que empiece por `organization_id`, y las 4 políticas. Luego añade la ruta en `src/app/dashboard/[slug]/<modulo>` y el ítem en `src/components/shell/nav.ts`.

### Pendiente según tu caso

- Envío de correo de invitación (hoy se genera el enlace para copiar/compartir por WhatsApp).
- Facturación: actualiza `plan` / `status` desde un webhook usando `service_role`.
- Si un usuario debe pertenecer a varias organizaciones, migra `profiles.organization_id` a una tabla `memberships` y guarda la org activa en un claim/cookie; las políticas cambian a `exists (select 1 from memberships …)`.
