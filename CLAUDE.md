# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Start dev server with Turbopack (http://localhost:3000)
npm run build        # Production build (Turbopack, ignores ESLint/TS errors)
npm run start        # Start production server
npm run lint         # Run ESLint (flat config, eslint.config.mjs)
npx supabase functions serve   # Run Edge Functions locally
npx supabase functions deploy <function-name>  # Deploy a single Edge Function
```

## Tech Stack

- **Framework**: Next.js 16 (App Router) with React 19 and TypeScript 5
- **Styling**: Tailwind CSS 4 (preflight disabled, typography plugin enabled)
- **Database/Auth**: Supabase (PostgreSQL + Auth with email/password)
- **UI Libraries**: Headless UI, Heroicons, FullCalendar 6, TanStack React Table, TipTap (rich text), Recharts, dnd-kit, Sonner (toasts)
- **Email**: Resend (via Supabase Edge Functions in Deno/TypeScript)
- **Path alias**: `@/*` maps to project root

## Architecture

### Application Structure

Single-organization app (Califica). No multi-tenancy. All pages use the Next.js App Router under `app/`. Every page is a client component (`"use client"`) that fetches data directly from Supabase via the client SDK. There is no API route layer — components query Supabase tables and call RPC functions directly.

### Authentication & Authorization

- `context/AuthContext.tsx` provides a global `useAuth()` hook exposing `session`, `user`, `isLoading`, and the `supabase` client instance.
- `context/PermissionsContext.tsx` provides `usePermissions()` hook exposing `role`, `mod_tareas`, `mod_calendario`, `mod_revenue`, `mod_finanzas`, `mod_customer_success`, `mod_comunicaciones`, `mod_marketing`, `mod_crm`, `mod_contenido_social`, `isLoading`, `refetch`.
- `components/AuthGuard.tsx` wraps protected pages; redirects to `/login` if unauthenticated.
- `components/ModuleGuard.tsx` wraps page content; checks module-level permissions. Shows "Acceso Denegado" if user lacks permission, or "Cuenta Pendiente" if user has no role (registered without invitation).
- **Roles**: `superadmin` (full access), `member` (org employee), `invitado` (external collaborator).
- **Permissions**: Per-module booleans in `user_permissions` table: `mod_tareas`, `mod_calendario`, `mod_revenue`, `mod_finanzas`, `mod_producto`, `mod_customer_success`, `mod_comunicaciones`, `mod_marketing`, `mod_crm`, `mod_contenido_social`. Superadmin always has all permissions.
- **Registration**: Invitation-only via `/register?invite_token=TOKEN`. Without token, registration is blocked.
- Role info + permissions fetched via `get_user_role_and_permissions` RPC.

### Key Routes

| Route | Purpose |
|---|---|
| `/` | Main dashboard — tasks, projects, activity feed |
| `/projects` | Project listing with favorites, delete, invite members (uses `ProjectCard`) |
| `/projects/[id]` | Project detail with Kanban board (drag-and-drop) |
| `/calendar` | FullCalendar event management with team-colored events |
| `/finance` | Finance Dashboard — 4-tab: Inbox, P&L, Métricas (growth integration), Config |
| `/revenue` | Growth Dashboard — 10-tab growth analytics (Resumen, NSM, Operacional, Revenue, País, Churn, Conversión, Adquisición, Comportamiento, Reportes) |
| `/producto` | Product module (Tareas Backlog, Finalizadas, Experimentos) |
| `/contenido-social` | Contenido Social — generar carruseles con IA desde blogs (5 pantallas) |
| `/contenido-social/[blogId]` | Generador de carruseles + comparación de modelos |
| `/contenido-social/[blogId]/[generationId]` | Editor de slides con banco de imágenes y export PNG |
| `/customer-success` | Customer Success dashboard (embedded Kali Analytics iframe) |
| `/marketing` | Marketing module — Performance (superadmin) or Organic (member/invitado) dashboard |
| `/crm` | CRM B2B — Pipeline Kanban + Lista + Reportes + Config (4 tabs) |
| `/admin/users` | Superadmin user & permissions administration |
| `/admin/api` | API keys management + endpoint documentation (superadmin) |
| `/settings/team` | Organization member management |
| `/settings/notifications` | Per-user notification preferences (email/in-app toggles) |

### Data Layer

- All Supabase queries happen client-side inside components (no server actions or API routes).
- **RPC functions**: `get_user_role_and_permissions`, `get_all_members`, `get_all_users_admin`, `update_user_role`, `update_user_module_permission`, `deactivate_user`, `add_member`, `remove_member`, `create_task_v2`, `create_project`, `get_project_members`, `get_projects_with_members`, `get_my_assigned_tasks_with_projects`, `toggle_project_favorite`, `delete_project_and_tasks`, `migrate_tasks_and_delete_project`, `create_content_review`, `submit_review_response`, `get_review_history`, `get_notification_preferences`, `upsert_notification_preferences`, `get_all_notification_preferences`, `get_notification_recipients`, `crm_user_access_level` (returns `'all'|'assigned_only'|'none'` based on role+mod_crm; usado por RLS de `crm_leads`), `crm_move_lead_stage` (params: `p_lead_id uuid, p_new_stage_id uuid, p_lost_reason_id uuid DEFAULT NULL`; mueve lead atómicamente, valida `is_lost` requiere razón, escribe `crm_lead_activities` con `activity_type='stage_changed'` y metadata `{from_stage_id, to_stage_id}`), `crm_get_pipeline_summary` (count + suma valor por stage para reportes), `crm_get_conversion_rates` (lead→ganado por mes, win rate por owner), `crm_get_lost_reasons_breakdown` (perdidos agrupados por razón), `get_executive_summary` (weekly KPIs + `weekly_trend` 8-week revenue/registrations array + `country_registrations` top-15 country table → jsonb), `get_churn_renewal` (churn/renewal tables → jsonb; params: `p_plan_filter text`, `p_upcoming_days int`; returns `newPaid`/`renewed` split + `plan_options`), `get_conversion_funnel` (funnel semanal + acumulado + weekly cohorts → jsonb; params: `p_week_start date`, `p_weeks int`, `p_eventos_filter text` ('all'|'0'..'4'|'5+'), `p_plan_status text` ('all'|'free'|'paid'|'cancelled'), `p_plan_id text`; returns `funnel_week`, `funnel_general`, `weekly`, `plan_options`), `get_conversion_trend_12w` (últimas 12 semanas registrados/activados/pagados → jsonb; params: `p_country text` ('all' o nombre del país); returns `country_options`, `weekly` array con `weekLabel`, `registered`, `activated` (eventos_valor≥5), `paid` (plan_paid), `activationPct`, `conversionPct`, `activatedToPayPct`. Independiente del WeekSelector, usado en gráfico de tendencia debajo de la tabla de Conversion Semanal), `get_yoy_revenue_matrix` (revenue diario y semanal YoY 2023-2026 → jsonb; params: `p_week_start date DEFAULT NULL` (NULL = última semana cerrada Dom-Sáb Lima); returns `meta`, `daily` array (30 días con y2023/y2024/y2025/y2026/growthPct), `weekly` array (12 semanas Dom-Sáb con mismo shape). Usado por el edge function `send-growth-report` para los charts de Revenue YoY), `get_acquisition_weekly_breakdown` (4 vistas para análisis de canal de adquisición → jsonb; params: `p_weeks int DEFAULT 8`; returns `meta`, `weeks` array, `channel_week` (canal × semana totales), `country_week` (país × semana, agrupado a Perú/México/Chile/Otros), `channel_country_acumulado` (canal × país all-time), `channel_country_last_week` (canal × país última semana cerrada). Categoriza `growth_users.origin` con CASE WHEN ILIKE en 8 buckets canónicos: Recomendación, Facebook, TikTok, Google, Instagram, Youtube, Whatsapp, Otros. Usado por `send-growth-report` para las secciones de Registros por País Trend y Canal de Adquisición), `get_acquisition_stats` (country/channel cross-tables → jsonb; params: `p_week_start date` (NULL=all-time), `p_country_filter text` (NULL=todos); channels grouped into 8 categories via CASE; returns `pctOfGrandTotal` per row), `get_revenue_by_country` (country×period matrix → jsonb), `get_weekly_operational_metrics` (grilla semanal del tab Operacional → jsonb; params: `p_week_start date`, `p_weeks int DEFAULT 8`, `p_country_filter text DEFAULT NULL`; returns `{meta: {weeks, country_options, dau_stale, events_stale}, sections: [{name, color, metrics: [{key, label, format, values, status, source}]}]}`. Combina 6 fuentes: `mkt_web_metrics` (sessions GA4, no filtra país), `mkt_web_page_metrics` (page_views /registro), `growth_users` (registros, filtra país), `growth_metrics_daily` (DAU global), `growth_events` (docs/descargas/kalichat/paywall/checkout/abandono, filtra país), `rev_orders`+`payment_failed` (revenue/ticket/fallidos, filtra país). Métricas con suffix `(global)` cuando hay filtro país pero la fuente no soporta segmentación).
- **Key tables**: `profiles` (role), `user_permissions` (module booleans), `org_settings` (singleton org config), `invitations` (invite tokens), `tasks` (uses `assignee_user_id` UUID column, not `assignee_id`), `content_reviews` (review rounds), `review_responses` (reviewer votes), `product_initiatives` (Dual-Track product items with RICE scoring), `notification_preferences` (per-user notification channel preferences), `project_favorites` (user-project favorite relation, managed via `toggle_project_favorite` RPC), `rev_orders` (payment orders with `client_type`, `plan_category`, `plan_duration` columns), `growth_users` (Bubble users sync), `growth_events` (Mixpanel events), `growth_funnels` (Mixpanel funnels), `growth_retention` (Mixpanel cohorts), `growth_metrics_daily` (DAU/WAU/MAU), `growth_report_config` (report recipients), `growth_report_log` (report send history), `growth_weekly_snapshots` (weekly computed metrics), `crm_pipeline_stages` (stages configurables con `is_default_entry`, `is_won`, `is_lost`, `color`, `display_order`), `crm_lost_reasons` (razones de pérdida con `display_order`), `crm_leads` (leads B2B; UNIQUE constraint on `external_id` — NOT a partial index, requerido para `ON CONFLICT` en upsert; `next_step` y `next_step_at` para acción próxima visible en card), `crm_lead_activities` (timeline append-only con `activity_type IN ('stage_changed','assigned','note','email_sent','call_made','meeting','status_changed')` y metadata jsonb), `crm_sync_log` (audit del edge function: `status`, `leads_fetched`, `leads_inserted`, `leads_skipped`, `error_message`, `started_at`, `finished_at`).
- Types are centralized in `lib/types.ts` — key entities: `Task`, `Project`, `CompanyEvent`, `UserPermissions`, `ProductInitiative`, `ExperimentData`. Finance types in `lib/finance-types.ts`: `Transaction`, `Account`, `Category`, `MonthlyMetric`, `PnLData`, `EXCHANGE_RATES`.

### Supabase Edge Functions (`supabase/functions/`)

Eleven Deno/TypeScript edge functions handle email + in-app notifications via Resend (plus lead sync):
- `send-event-notification` — new calendar events (filtered by `get_notification_recipients('event_created')`, excludes creator)
- `send-assignment-notification` — task assignments + task completed (email + in-app, respects preferences)
- `notify-mentions` — @mentions in comments (respects preferences)
- `invite-user-to-team` — user invitations (assigns role + permissions based on email domain)
- `send-custom-invite` — custom invitation emails with registration token
- `send-review-notification` — content review requests to reviewers (respects `review_request` preferences)
- `send-approval-notification` — notifies requester when reviewer approves (respects `review_result` preferences)
- `send-rejection-notification` — notifies requester when reviewer rejects with reason (respects `review_result` preferences)
- `auto-approve-reviews` — cron-invoked function to auto-approve expired reviews (deployed with `--no-verify-jwt`, protected with `CRON_SECRET` via query param or `x-cron-secret` header)
- `sync-crm-leads` — Pull de leads B2B desde la API externa de Califica al CRM. Deployed con `--no-verify-jwt` (para CORS preflight). **Body contract**: `{}` (cron, requiere `CRON_SECRET` via `?secret=` o header `x-cron-secret`), `{ manual: true }` (requiere user JWT + role superadmin; usa ventana fija de 90 días en lugar del último sync incremental, para permitir backfill de leads históricos). Flow: auth → resolver `since` → fetch paginado a `LEADS_API_URL` con Bearer `LEADS_API_TOKEN` → upsert con `onConflict: 'external_id', ignoreDuplicates: true` → backfill por campo (country/phone/position) usando `.is(field, null)` para no pisar ediciones manuales → notificación via `get_notification_recipients('crm_lead_new')` (in-app a recipients). Cron `cron-job.org` cada 5 min. Idempotency via `crm_sync_log` table.
- `send-growth-report` — reporte semanal automatizado del board (Auke). Reescrito para reemplazar el reporte manual de Arturo. Llama 6 RPCs en paralelo (`get_executive_summary`, `get_yoy_revenue_matrix`, `get_revenue_by_country`, `get_churn_renewal`, `get_conversion_funnel`, `get_acquisition_stats`) con `Promise.allSettled` + timeout 15s/30s, ensambla HTML con 5 charts de QuickChart (Revenue YoY weekly+daily, Ventas semanales stacked, Churn vs Growth combinado, Funnel conversión multi-line) + 5 tablas (Headline KPIs, Revenue por país, País × status, Canal × status, Renovaciones), cada chart con narrativa de las últimas 3 semanas debajo. Usa helpers de `_shared/email-builder.ts` (`emailShell`, `kpiTable`, `matrix`, `lineChartYoY`, `stackedBarChart`, `combinedBarLineChart`, `multiLineChart`). Semana = última cerrada Dom-Sáb hora Lima. Idempotency guard via `growth_report_log.status IN ('sent','partial')`. **Body contract**: `{}` (envío real con cron secret), `{ force: true }` (bypass idempotency), `{ preview: true }` (retorna HTML sin enviar), `{ test: true, to: "email" }` (envía solo a un email, loggea como `status='test'`), `{ week_start_override: "YYYY-MM-DD" }` (envía reporte de una semana específica, debe ser domingo). Protected con `CRON_SECRET` para envío real. Cron pg_cron `send-growth-report-weekly` programado lunes 14:00 UTC = 9am Lima.

**Edge Function patterns:**
- All functions use shared `_shared/cors.ts` (Allow-Origin: `*`) and `_shared/escapeHtml.ts`.
- Email sender: `tareas@califica.ai` (verified in Resend). Do NOT use other sender addresses.
- Invocation from client: use `fetch()` with `Authorization: Bearer ANON_KEY` (NOT `supabase.functions.invoke()`).
- In-app notifications: insert into `notifications` table with columns `recipient_user_id`, `message`, `link_url`.
- **Notification preferences**: All edge functions consult `get_notification_preferences` RPC (or `get_notification_recipients` for broadcast) before sending. Respects per-user `send_email`/`send_inapp` flags.

### Notifications System

- **Table**: `notifications` — columns: `id`, `created_at`, `recipient_user_id`, `message`, `is_read`, `link_url`.
- **Preferences table**: `notification_preferences` — columns: `user_id` (PK), `event_created`, `task_assigned`, `task_completed`, `mention`, `review_request`, `review_result`, `updated_at`. Values: `'all'|'inapp'|'email'|'off'|'default'`.
- **Bell icon**: `components/Notifications.tsx` in TopBar. Real-time via Supabase channel subscription on `postgres_changes` INSERT.
- **Edge functions** insert notifications server-side using service role key.
- **Preferences UI**: `/settings/notifications` — user-facing toggles (Email/Campanita) per notification type. Admin can edit any user's preferences via `NotificationPrefsModal` in `/admin/users`.
- **`get_notification_recipients(type)`**: SQL function that resolves defaults by role, filters by module permissions (for broadcast types like `event_created`), and returns `(user_id, email, send_email, send_inapp)`. Used by `send-event-notification`.
- **Defaults by role**: Superadmin gets all; Member gets inapp for events, all for rest; Invitado gets off for events, inapp for task_completed, all for rest.

### Layout & Navigation

- **Sidebar** (`components/Sidebar.tsx`): Collapsible left sidebar (240px expanded, 64px collapsed). State persisted in localStorage. Mobile: overlay with backdrop, triggered by hamburger button. Nav items are conditional based on user permissions. Footer has admin link (superadmin only), user email, and logout.
- **TopBar** (`components/TopBar.tsx`): Fixed top bar on main content area with notification bell and Califica logo (right-aligned). Only renders when user is authenticated.
- **Layout** (`app/layout.tsx`): Flex horizontal — `Sidebar | (TopBar + main content)`. Login/Register pages don't show sidebar or topbar (components return null when no user).
- **Favicon**: `app/icon.svg` (monster from Califica logo). Auto-detected by Next.js convention.

### Finance Module (4-tab dashboard at `/finance`)

The `/finance` route implements a CFO dashboard with 4 tabs (same pattern as `/revenue` and `/marketing`):
- **Inbox tab**: Transaction table with inline editing, bulk operations (verify, edit lote), status filter (Por Revisar/Histórico/Todo), search, pagination, **account filter** (dropdown). Upload facturas via n8n webhook (IA) or manual entry. CurrencyEditModal for exchange rate correction. Transactions have optional `account_id` FK to `fin_accounts`.
- **P&L tab**: 3 Recharts (income vs expenses, cost structure, net margin %) + expandable P&L matrix (PnLSection) with drill-down by parent → category → description.
- **Métricas tab**: KPI cards (Runway, CAC, Cash Flow, Caja Total). **Growth integration**: Revenue auto-loaded from `rev_orders` (split Nuevo/Renovación), new customers auto from `growth_users` (plan_paid=true) with manual override via `fin_monthly_metrics`. CacEvolutionChart with hybrid customer data. **Live exchange rates** via `useExchangeRates` hook (fallback to hardcoded).
- **Config tab**: Account CRUD (create/edit/delete via AccountModal), balance management, CategorySettingsModal (fixed expense + CAC flags), OperationalMetricsModal (manual customer count override).
- **Date range filter**: Global in header (Este Mes, 3M, 6M, 12M, Todo, Custom) — hidden on Config tab.
- **Tables**: `fin_transactions` (with `account_id` FK nullable), `fin_categories`, `fin_accounts`, `fin_monthly_metrics`. Reads from `rev_orders` and `growth_users` for automated metrics.
- **Exchange rates**: `hooks/useExchangeRates.ts` fetches live from `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api`. Fallback to `EXCHANGE_RATES` constant in `lib/finance-types.ts`.
- **n8n webhook**: `NEXT_PUBLIC_N8N_WEBHOOK_URL` env var. 30s timeout via AbortController, specific 404 error message.
- **Components**: `components/finance/` — InboxTab, PnLTab, MetricasTab, ConfigTab, AccountModal, PnLSection, AutocompleteInput, useFinanceDateRange. Shared: `components/` — UploadFinanceModal, CurrencyEditModal, CategorySettingsModal, OperationalMetricsModal, FinancialCharts, CacEvolutionChart.

### Component Patterns

- Forms use controlled state; `EditTaskForm` auto-saves with 1500ms debounce.
- Modals use a generic `Modal` component with click-outside-to-close.
- Kanban uses dnd-kit with `PointerSensor` (8px activation distance).
- Task statuses: `Por Hacer`, `En Progreso`, `Hecho`.
- Brand colors: primary red `#ff8080`, secondary blue `#3c527a`, background `#F8F8F8`, text `#383838`.

### Content Approval System

Calendar events support a content approval workflow:
- **Flow**: User requests review → reviewers approve/reject → auto-approve on timer expiry.
- **Tables**: `content_reviews` (rounds with timer, optional `requester_comment` TEXT), `review_responses` (per-reviewer votes). `company_events.review_status` tracks current state (`none`, `pending`, `approved`, `rejected`).
- **Visual**: Review status shown as colored borders on calendar events — green (approved), yellow (pending), red (rejected) with 3px width.
- **Deep links**: `/calendar?event=123` opens the event modal directly (used in notification emails).
- **Auto-approve**: `auto-approve-reviews` edge function invoked by external cron every 5 min. Protected with `CRON_SECRET` env var.
- **Components**: `CountdownTimer` (expiration countdown), review mode in `EventDetailModal` (request form, response panel, history).

### Growth Module (10-tab dashboard at `/revenue`)

The `/revenue` route implements a Growth Dashboard with 10 tabs:
- **Resumen Ejecutivo**: Weekly KPI grid — Revenue (total/new/recurring/ARPU) from `rev_orders`. Hero card verde NSM con total activados 7+, nuevos esta semana, variación % vs semana anterior (datos directo de growth_users, no RPC). Users section: 3 cards (registros, % activación 7+, % conversión). 8-week trend ComposedChart. Country registrations table (top 15). WeekSelector. Sync badges (users_platform + payments_platform) de `sync_logs`.
- **NSM (7+)**: North Star Metric analysis — 4 KPIs (total 7+, nuevos semana, tiempo activación mediana, base total). Banner highlight verde. Distribución por bucket (histograma 0/1-2/3-4/5-6/7-9 NSM+/10-14/15+). Tiempo a activación (proxy last_login - created_date). Tendencia semanal 12 semanas con toggles por serie (barras nuevos + línea acumulado + área tasa). Tabla cohortes activación (8 semanas × 4 columnas sem1-4, color-coded). Filtros país + período registro. RPC `get_nsm_analysis(p_country_filter, p_registration_period)`.
- **Operacional**: Grilla semanal (columnas = 4/8/12 semanas Dom-Sáb Lima, filas = métricas agrupadas en 3 secciones color-coded: Funnel Digital (sesiones califica.ai, CTR CTA registrarse, registros, tasa registro), Producto (DAU, Documentos creados/día, Documentos/usuario activo, Descargas/día, Mensajes Kalichat/día, Vistas Paywall), Ventas (Visitas checkout, Revenue diario, Tasa abandono checkout, Pagos fallidos, Ticket promedio). RPC `get_weekly_operational_metrics(p_week_start, p_weeks)` retorna `{meta, sections}` jsonb con `status: 'ok'|'stale'|'pending'` por celda. Banner amarillo cuando DAU (`growth_metrics_daily`) o `growth_events` están stale (>2 días atrás). Incluye chart de tendencia debajo con selector multi-métrica por sección (checkboxes con toggle de grupo) y LineChart Recharts. Todas las métricas de producto vienen de `growth_events` (sync via n8n workflow `GRW_Sync_Mixpanel_Events`, daily 6:30am). Re-usa `WeekSelector`.
- **Revenue**: Improved revenue explorer — WeekSelector + Este Mes + Personalizado date modes, granularity toggle (daily/weekly/monthly), stacked bars (Nuevo vs Renovación), distribution blocks (table+pie side by side for country/plan/provider), paginated detail table with inline editing (superadmin/domingo@califica.ai only), column sorting (Fecha/País/Monto), dynamic plan filter (from `growth_users.plan_id` + `rev_orders.product_name`) and dynamic country filter from DB.
- **Por País**: Matrix table — rows=countries, columns=periods (monthly/weekly/daily), year selector (2024-2026), optional YoY % growth overlay. Summary stats.
- **Churn & Renovación** (Fase 2): Weekly churn table, renewal tracking, actionable renewal list. Requires `growth_users`.
- **Conversión** (Fase 2+3): Funnel semanal (principal, 12 pasos: Registrados→1+→...→10+→Pagaron, **activación=7+ (NSM)**, paso 7+ marcado con badge estrella verde, tasa conv→pago en 7+/8+/9+) + acumulado inline + weekly cohort table con columnas ev1-ev9, 10+. Cross-filters: `eventos_valor` (0-9, 10+, 7+), `plan_status` (free/paid/cancelled), `plan_id` sub-dropdown (when paid). Onboarding + Paywall funnels from Mixpanel via `get_onboarding_funnel` RPC (requiere pipeline n8n `GRW_Sync_Mixpanel_Funnels`).
- **Adquisición** (Fase 2+3): WeekSelector + toggle acumulado. Country×Status cross-table, Channel×Status (8 grouped channels) cross-table, Channel×Plan cross-table. `pctOfGrandTotal` column. Requires `growth_users`.
- **Comportamiento** (Fase 3): DAU/WAU/MAU chart (ComposedChart), DAU pagados vs gratuitos (stacked AreaChart), retention cohorte semanal (tabla triangular color-coded), retention dias clave (Day 1/3/7/14/30). Data: `growth_metrics_daily` + `growth_retention` via Mixpanel n8n pipelines (`GRW_Sync_Mixpanel_Metrics`, `GRW_Sync_Mixpanel_Retention`). RPCs: `get_behavior_metrics(p_days)`, `get_onboarding_funnel(p_weeks)`.
- **Reportes** (Fase 4, superadmin only): Report recipients CRUD, send history, test send.
- **Components**: `components/growth/` — KpiCard, GrowthFilters, WeekSelector, ExecutiveSummary, RevenueTab, RevenueByCountry, ChurnRenewal, ConversionFunnel, AcquisitionTab, RetentionCohort, ReportConfig.
- **Data sources**: `rev_orders` (existing, enhanced), `growth_users` (Bubble Users via n8n), `growth_events`/`growth_funnels`/`growth_retention`/`growth_metrics_daily` (Mixpanel via n8n).

### Communications Module (5-tab dashboard at `/comunicaciones`)

The `/comunicaciones` route implements a WhatsApp communications dashboard with 5 tabs: Campañas, Métricas, Automatizaciones, Templates, Configuración.
- **Templates tab**: CRUD for WhatsApp message templates with Meta approval workflow. Bulk CSV upload via `BulkUploadTemplatesModal`. Individual/bulk delete and archive (from Meta + local DB). Archive system: `archived_at` column, archived templates hidden from campaign selector, bulk archive via checkbox selection, reactivate from "Archivados" filter tab.
- **Campañas tab**: 3-step campaign creation (Step1: segmentation filters, Step2: template selector with search/filter/sort + split layout with scrollable list + sticky preview, Step3: name/schedule/auto-reply + test button). Auto-reply per campaign via `comm_broadcasts.auto_reply_message` (12h window, no cooldown). Test button sends to all `comm_test_contacts` with temporary broadcast for auto-reply testing. Supports single message and sequence modes.
- **Template Queue System**: Bulk uploads use a queue to avoid saturating Meta's review. Templates are assigned to batches (`queue_batch` column). A cron job (every 15 min) or manual button calls `process-template-queue` API to: check active batch status with Meta → advance to next batch when resolved → submit next batch. Queue status banner in Templates tab shows progress with auto-polling every 60s.
- **API Routes** (`app/api/communication/`): `submit-template`, `bulk-submit-templates`, `delete-template`, `check-template-status`, `process-template-queue` (queue processor, CRON_SECRET or auth), `queue-status` (GET, queue state for UI), `send-broadcast`, `sync-broadcast`, `send-test` (sends to test contacts, supports auto-reply testing via temporary broadcast), `event` (Bubble webhook), `status-update` (Kapso webhook), `incoming` (incoming WhatsApp messages, campaign-specific auto-reply within 12h window + global auto-reply with 24h cooldown).
- **Tables**: `comm_templates` (with `queue_batch`, `queue_priority`, `archived_at` for archive system), `comm_broadcasts` (with `auto_reply_message` for campaign-specific replies), `comm_variables`, `comm_test_contacts`, `comm_message_logs`, `comm_automations`, `comm_drip_campaigns`, `comm_drip_steps`, `comm_drip_optouts`.
- **Kapso integration**: `lib/kapso.ts` — `submitTemplateToMeta`, `getTemplateStatus`, `deleteTemplateFromMeta`, `createBroadcast`, `addBroadcastRecipients`, `sendBroadcast`, `getBroadcastStatus`, `sendTemplateMessage`, `sendTextMessage`.
- **Components**: `components/comunicaciones/` — Templates, BulkUploadTemplatesModal, Campanias, Metricas, Automatizaciones, DripCampaigns, Configuracion.

### Marketing Module (6-tab dashboard at `/marketing`)

The `/marketing` route implements a Marketing Dashboard with tab-based navigation (same pattern as `/revenue`):
- **Superadmin view — 6 tabs**: Resumen, Ads, Web y Blog, Orgánico, Conversiones, Sync. DateRangePicker global in header applies to all tabs (except Sync). Tab bar with icons.
- **Member/Invitado view**: Single organic view without tab bar — OrganicOverview + YouTubeMetrics with DateRangePicker.
- **Resumen tab**: Executive KPI overview — 4 sections (Ads: gasto/conversiones/CPA, Web: sesiones/nuevos usuarios/conversiones GA4, Orgánico: seguidores/nuevos/engagement, Conversiones: registros/compras/revenue/tasa).
- **Ads tab**: AdsOverview — consolidated KPIs, platform comparison (Meta/Google/TikTok), campaign table.
- **Web y Blog tab**: WebAnalytics — GA4 KPIs, hostname breakdown, traffic sources, top pages, pages catalog.
- **Orgánico tab**: OrganicOverview (4 platforms) + PostsFeed (FB + IG posts with engagement score) + YouTubeMetrics (video detail).
- **Conversiones tab**: ConversionsSection — registrations/purchases/revenue from Supabase with UTM breakdown.
- **Sync tab** (superadmin only): Full sync status table from `mkt_sync_logs` — source, status badge, records processed, timestamp, errors.
- **Date range filter**: Global filter with presets (7d, 14d, 30d, mes actual, custom).
- **Empty states**: Each section gracefully handles missing API connections.
- **Tables**: `mkt_campaigns`, `mkt_ad_metrics` (platform+platform_campaign_id for join, campaign_id NULL), `mkt_organic_accounts`, `mkt_organic_metrics` (platform_name+platform_account_id), `mkt_organic_video_metrics` (YouTube videos), `mkt_organic_post_metrics` (FB+IG posts, reach/impressions deprecated=0), `mkt_web_metrics` (UNIQUE date+hostname, 2 rows per day), `mkt_web_pages` (URL catalog with page_type), `mkt_web_page_metrics` (per-URL daily), `mkt_sync_logs`. UTM columns added to `growth_users` and `rev_orders` (all NULL until Bubble captures them).
- **RLS**: All marketing data (ads, web, organic, sync) accessible to users with `mod_marketing` permission (via `mkt_has_access()` function). No role-based content restriction within the module — all users see the same tabs and data. Sync tab hidden in UI for non-superadmin but data accessible via RLS.
- **Ads creative quality metrics**: `mkt_ad_metrics` includes `video_3s_views`, `video_thruplay`, `landing_page_views`, `hook_rate` (green ≥30%), `retention_rate` (green ≥15%), `click_quality_rate` (green ≥80%). Campaigns without video show `—` for hook/retention.
- **n8n workflows**: 8 workflows (MKT_ prefix) sync data from Meta/Google/TikTok/YouTube/GA4. Documented in `temp-docs/Marketing/n8n_workflows.md`.
- **Components**: `components/marketing/` — ResumenTab, OrganicTab, SyncTab, ads/ (AdsOverview, PlatformCard, CampaignTable), organic/ (OrganicOverview, PlatformMetrics, YouTubeMetrics), web/ (WebAnalytics, PagesCatalog), conversions/ (ConversionsSection), shared/ (DateRangePicker, SyncStatus, EmptyState, useDateRange, useMarketingData).

### CRM B2B Module (4-tab dashboard at `/crm`)

CRM para tracking de leads B2B (colegios) que entran desde landings de Califica. El CEO procesaba los leads manualmente; este módulo lo automatiza con sync via API + pipeline visual.

- **Pipeline tab** (`PipelineKanban`): Kanban con dnd-kit, columnas por stage activo (Nuevo → Contactado → Calificado → Demo → Propuesta → Ganado / Perdido). Drag a un stage `is_lost=true` abre `LostReasonModal` antes de mover. Las cards (`LeadCard`) muestran nombre, empresa, país, valor estimado, badge "sin asignar" o avatar del owner, bloque amarillo accionable de `next_step` con fecha relativa, y footer con `actividad: N · Xd`. Botón "+ Nuevo lead" para creación manual via `NewLeadModal`. Stats de actividades fetcheadas en paralelo y agregadas client-side.
- **Lista tab** (`LeadsList`): Tabla con búsqueda, filtros (stage/owner/país/fuente), sort multi-columna, bulk select + bulk assign, paginación 50/page. Columna Actividad con mismo indicador que las cards. Click en una fila abre el `LeadSidePeek`.
- **Reportes tab** (`CrmReports`): 7 charts Recharts (pipeline por stage, conversion rate por owner, breakdown de razones de pérdida, trend semanal de leads creados, etc.) — todo client-side aggregation.
- **Config tab** (`CrmConfig`, superadmin only): CRUD de stages (color, orden, flags `is_default_entry/is_won/is_lost`), CRUD de lost reasons, tabla de últimos 20 syncs (`crm_sync_log`), botón "Sync ahora" que llama al edge function con `{ manual: true }`.
- **SidePeek** (`LeadSidePeek`): Panel lateral 480px con info editable (nombre/email/teléfono/empresa/cargo/país, todo con auto-save 1500ms debounce), asignación instantánea, próximo paso + fecha, valor estimado/cerrado, notas, botón eliminar con confirm, timeline de actividades (form + lista). `useEffect` syncea local state cuando cambia `initialLead.id` (no en cada refetch del padre, así no pisa lo que estás escribiendo).
- **Multi-tenant ready**: Diseñado para futuros partners externos. RLS via helper `crm_user_access_level()` que retorna `'all' | 'assigned_only' | 'none'`. Por ahora solo superadmin tiene `'all'`, pero la estructura está lista para agregar partners.
- **Sync de leads externos**: Edge function `sync-crm-leads` (ver sección Edge Functions) corre via cron-job.org cada 5 min. La API externa está en `https://web-califica-v2bl.vercel.app/api/leads` (futuro corte DNS a `califica.ai/api/leads`), retorna leads con `id, name, email, institution, role, phone, country, source, utm_*, created_at`. Países vienen como ISO lowercase (`pe/mx/cl/other`) y se mapean en `COUNTRY_MAP`. Leads históricos pueden tener `country/phone/role` en null — el backfill solo llena campos vacíos via `.is(field, null)`, nunca pisa ediciones manuales.
- **Notificaciones**: Cuando entran leads nuevos via sync, se inserta una notificación in-app por recipient (resuelto via `get_notification_recipients('crm_lead_new')`). El bell del topbar la muestra en realtime.
- **Components**: `components/crm/` — PipelineKanban, LeadCard, LeadSidePeek, LeadsList, CrmReports, CrmConfig, NewLeadModal, LostReasonModal. Types en `lib/crm-types.ts`: `CrmLead`, `CrmPipelineStage`, `CrmLostReason`, `CrmLeadActivity`, `CrmSyncLog`, `CrmUser`.

### Product Module (Tareas Backlog | Finalizadas | Experimentos)

The `/producto` route implements a simplified product management system with three tabs:
- **Tareas Backlog tab**: Simple checklist operativo diario. Lista de tareas con drag & drop vertical (dnd-kit) para reordenar por prioridad manual (`manual_order` column). Cada tarea: título (max 80 chars) + descripción + checkbox para completar. Botón "Nueva tarea" abre modal con título + descripción. Al completar: `phase = 'finalized'`, `status = 'completed'`, `completed_at = now()`. RICE scoring eliminado de la UI (columnas quedan en DB pero no se muestran).
- **Finalizadas tab** (phase=`finalized` in DB): Lista de tareas completadas con check verde, título tachado, fecha+hora de finalización y tiempo de vida (ej: "3d 4h"). Agrupado por día (Hoy, Ayer, fecha). Badge "X completadas hoy" para tracking diario. Filtros por período: Todo, Hoy, 7 días, 30 días, Rango custom con date pickers. Botón "Reabrir" devuelve a backlog (limpia `completed_at`).
- **Experimentos tab** (phase=`discovery` in DB): Sin cambios — Notion-style table con experiment fields, hipótesis, métricas, resultados.
- **SidePeek**: Simplificado para backlog (solo título + descripción editables). Para finalizadas: solo lectura con fecha y botón reabrir. Para discovery: campos completos de experimento sin cambios.
- **Table**: `product_initiatives` with `manual_order` (int) for drag ordering, `completed_at` (timestamptz) for completion tracking. RICE columns exist in DB but not shown in UI.
- **Components**: `components/producto/` — BacklogTable, SidePeek, PromoteForm, RoadmapKanban, ExperimentosTable, FinalizeModal.

### Contenido Social Module (5-screen at `/contenido-social`)

Module for generating social media carousels from blog posts using AI (OpenRouter via califica.ai API).
- **Screen 1 — Blog List**: Fetches blogs from `GET /api/content-social/blogs` (proxy to califica.ai). Table with search, status filters (sin generar/generados/publicados), cross-referenced with `content_generations` table. Tab Historial with cost/model metrics.
- **Screen 2 — Generator** (`/contenido-social/[blogId]`): Config form (model, tone, platform, CTA, slides count). Model comparison side-by-side. Toast loading during generation (~15-30s). History of generations per blog.
- **Screen 3 — Editor** (`/contenido-social/[blogId]/[generationId]`): Carousel tabs. Slide thumbnails with click-to-edit. SlidePreview renders 1080x1080 with 3 templates (centered, split, minimal). SlideEditor with: text editing (title/body/CTA with char counter), typography (font family Nunito/Codec Pro/Lazy Dog, size, weight, italic, alignment), 7 color schemes (naranja/navy/blanco/negro/lima/arena/lavanda), image bank (Supabase Storage bucket `content-images` with upload/delete/position/size/rotation/layer). Auto-save with 1500ms debounce. Caption + hashtags editor with clipboard copy.
- **Screen 4 — Export Modal**: Format selector (1080x1080/1080x1920/1200x628). Per-slide checkboxes. Include caption as .txt. html2canvas → JSZip → file-saver download.
- **Screen 5 — History**: Table with date, blog, model, tokens, cost, time, status. Monthly KPIs (spend, generations, most efficient model).
- **API Routes** (server-side proxy, key not exposed): `app/api/content-social/blogs/route.ts` (GET), `app/api/content-social/generate/route.ts` (POST). Auth via `CALIFICA_API_KEY` env var (server-only).
- **Tables**: `content_generations` (blog_id, result jsonb, edited_result jsonb, status, tokens_used, cost_usd, processing_time_ms). Storage bucket `content-images` for image bank.
- **Dependencies**: html2canvas, jszip, file-saver.
- **Components**: `components/contenido-social/` — BlogList, GeneratorConfig, CarouselEditor, SlidePreview, SlideEditor, ImageBank, ExportModal, HistoryTable, ModelComparison.

### Public API Endpoints

External-facing API endpoints for integration with other Califica platforms. Auth via `api_keys` table (SHA-256 hash validation, `lib/api-auth.ts`).

**Calendar:**
- **`POST /api/calendar/events`** (calendar:write): Create events. Required: title, start_date, team. Optional: end_date, description, video_link, custom_data, notify.
- **`GET /api/calendar/events`** (calendar:read): List events filtered by from/to/team/limit.

**Tasks (Producto):**
- **`GET /api/tasks`** (tasks:read): List tasks. Params: status (active/completed/all), category (producto/customer_success/marketing/otro), limit.
- **`POST /api/tasks`** (tasks:write): Create task. Required: title. Optional: description, category.
- **`PATCH /api/tasks`** (tasks:write): Update/complete/reopen. Body: id + action (complete/reopen) or field updates.

**Admin panel** (`/admin/api`): API key CRUD (SHA-256 hashed, key shown once on creation, revoke/reactivate). Endpoint documentation with category sidebar (Calendario/Producto/Contenido), search, markdown export for AI agents. Granular permissions per key (calendar:read/write, tasks:read/write, content:read/write).
- **Table**: `api_keys` (name, key_hash, key_prefix, permissions text[], is_active, last_used). RLS superadmin only.

## Language

The application UI and commit messages are in Spanish.
