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
- `context/PermissionsContext.tsx` provides `usePermissions()` hook exposing `role`, `mod_tareas`, `mod_calendario`, `mod_revenue`, `mod_finanzas`, `mod_customer_success`, `mod_comunicaciones`, `mod_marketing`, `isLoading`, `refetch`.
- `components/AuthGuard.tsx` wraps protected pages; redirects to `/login` if unauthenticated.
- `components/ModuleGuard.tsx` wraps page content; checks module-level permissions. Shows "Acceso Denegado" if user lacks permission, or "Cuenta Pendiente" if user has no role (registered without invitation).
- **Roles**: `superadmin` (full access), `member` (org employee), `invitado` (external collaborator).
- **Permissions**: Per-module booleans in `user_permissions` table: `mod_tareas`, `mod_calendario`, `mod_revenue`, `mod_finanzas`, `mod_producto`, `mod_customer_success`, `mod_comunicaciones`, `mod_marketing`. Superadmin always has all permissions.
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
| `/revenue` | Growth Dashboard — 8-tab growth analytics (Revenue, Country, Churn, Conversion, Acquisition, Behavior, Reports) |
| `/producto` | Product module (Backlog, Roadmap, Experimentos) |
| `/customer-success` | Customer Success dashboard (embedded Kali Analytics iframe) |
| `/marketing` | Marketing module — Performance (superadmin) or Organic (member/invitado) dashboard |
| `/admin/users` | Superadmin user & permissions administration |
| `/settings/team` | Organization member management |
| `/settings/notifications` | Per-user notification preferences (email/in-app toggles) |

### Data Layer

- All Supabase queries happen client-side inside components (no server actions or API routes).
- **RPC functions**: `get_user_role_and_permissions`, `get_all_members`, `get_all_users_admin`, `update_user_role`, `update_user_module_permission`, `deactivate_user`, `add_member`, `remove_member`, `create_task_v2`, `create_project`, `get_project_members`, `get_projects_with_members`, `get_my_assigned_tasks_with_projects`, `toggle_project_favorite`, `delete_project_and_tasks`, `migrate_tasks_and_delete_project`, `create_content_review`, `submit_review_response`, `get_review_history`, `get_notification_preferences`, `upsert_notification_preferences`, `get_all_notification_preferences`, `get_notification_recipients`, `get_executive_summary` (weekly KPIs + `weekly_trend` 8-week revenue/registrations array + `country_registrations` top-15 country table → jsonb), `get_churn_renewal` (churn/renewal tables → jsonb; params: `p_plan_filter text`, `p_upcoming_days int`; returns `newPaid`/`renewed` split + `plan_options`), `get_conversion_funnel` (funnel semanal + acumulado + weekly cohorts → jsonb; params: `p_week_start date`, `p_weeks int`, `p_eventos_filter text` ('all'|'0'..'4'|'5+'), `p_plan_status text` ('all'|'free'|'paid'|'cancelled'), `p_plan_id text`; returns `funnel_week`, `funnel_general`, `weekly`, `plan_options`), `get_acquisition_stats` (country/channel cross-tables → jsonb; params: `p_week_start date` (NULL=all-time); channels grouped into 8 categories via CASE; returns `pctOfGrandTotal` per row), `get_revenue_by_country` (country×period matrix → jsonb).
- **Key tables**: `profiles` (role), `user_permissions` (module booleans), `org_settings` (singleton org config), `invitations` (invite tokens), `tasks` (uses `assignee_user_id` UUID column, not `assignee_id`), `content_reviews` (review rounds), `review_responses` (reviewer votes), `product_initiatives` (Dual-Track product items with RICE scoring), `notification_preferences` (per-user notification channel preferences), `project_favorites` (user-project favorite relation, managed via `toggle_project_favorite` RPC), `rev_orders` (payment orders with `client_type`, `plan_category`, `plan_duration` columns), `growth_users` (Bubble users sync), `growth_events` (Mixpanel events), `growth_funnels` (Mixpanel funnels), `growth_retention` (Mixpanel cohorts), `growth_metrics_daily` (DAU/WAU/MAU), `growth_report_config` (report recipients), `growth_report_log` (report send history), `growth_weekly_snapshots` (weekly computed metrics).
- Types are centralized in `lib/types.ts` — key entities: `Task`, `Project`, `CompanyEvent`, `UserPermissions`, `ProductInitiative`, `ExperimentData`. Finance types in `lib/finance-types.ts`: `Transaction`, `Account`, `Category`, `MonthlyMetric`, `PnLData`, `EXCHANGE_RATES`.

### Supabase Edge Functions (`supabase/functions/`)

Ten Deno/TypeScript edge functions handle email + in-app notifications via Resend:
- `send-event-notification` — new calendar events (filtered by `get_notification_recipients('event_created')`, excludes creator)
- `send-assignment-notification` — task assignments + task completed (email + in-app, respects preferences)
- `notify-mentions` — @mentions in comments (respects preferences)
- `invite-user-to-team` — user invitations (assigns role + permissions based on email domain)
- `send-custom-invite` — custom invitation emails with registration token
- `send-review-notification` — content review requests to reviewers (respects `review_request` preferences)
- `send-approval-notification` — notifies requester when reviewer approves (respects `review_result` preferences)
- `send-rejection-notification` — notifies requester when reviewer rejects with reason (respects `review_result` preferences)
- `auto-approve-reviews` — cron-invoked function to auto-approve expired reviews (deployed with `--no-verify-jwt`, protected with `CRON_SECRET` via query param or `x-cron-secret` header)
- `send-growth-report` — weekly growth report email to configured recipients in `growth_report_config`. Computes metrics from `rev_orders` + `growth_users`, saves snapshot to `growth_weekly_snapshots`, logs to `growth_report_log`. Protected with `CRON_SECRET`. Supports `{ test: true }` body for manual trigger from UI.

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

### Growth Module (8-tab dashboard at `/revenue`)

The `/revenue` route implements a Growth Dashboard with 8 tabs:
- **Resumen Ejecutivo**: Weekly KPI grid — Revenue (total/new/recurring/ARPU) from `rev_orders`, Users (3 cards: nuevos registros/activacion/conversion + total inline) from `growth_users`. 8-week trend ComposedChart (stacked bars rev nuevo/renovacion + line registros). Country registrations table (top 15 with conversion %). WeekSelector for navigation.
- **Revenue**: Improved revenue explorer — WeekSelector + Este Mes + Personalizado date modes, granularity toggle (daily/weekly/monthly), stacked bars (Nuevo vs Renovación), distribution blocks (table+pie side by side for country/plan/provider), paginated detail table with inline editing (superadmin/domingo@califica.ai only), column sorting (Fecha/País/Monto), dynamic plan filter (from `growth_users.plan_id` + `rev_orders.product_name`) and dynamic country filter from DB.
- **Por País**: Matrix table — rows=countries, columns=periods (monthly/weekly/daily), year selector (2024-2026), optional YoY % growth overlay. Summary stats.
- **Churn & Renovación** (Fase 2): Weekly churn table, renewal tracking, actionable renewal list. Requires `growth_users`.
- **Conversión** (Fase 2+3): Funnel semanal (principal) + acumulado inline + weekly cohort table. Cross-filters: `eventos_valor` (0-4, 5+), `plan_status` (free/paid/cancelled), `plan_id` sub-dropdown (when paid). Onboarding funnel from Mixpanel (placeholder).
- **Adquisición** (Fase 2+3): WeekSelector + toggle acumulado. Country×Status cross-table, Channel×Status (8 grouped channels) cross-table, Channel×Plan cross-table. `pctOfGrandTotal` column. Requires `growth_users`.
- **Comportamiento** (Fase 3): DAU/WAU/MAU trends, retention cohorts, paywall insights. Requires Mixpanel pipeline.
- **Reportes** (Fase 4, superadmin only): Report recipients CRUD, send history, test send.
- **Components**: `components/growth/` — KpiCard, GrowthFilters, WeekSelector, ExecutiveSummary, RevenueTab, RevenueByCountry, ChurnRenewal, ConversionFunnel, AcquisitionTab, RetentionCohort, ReportConfig.
- **Data sources**: `rev_orders` (existing, enhanced), `growth_users` (Bubble Users via n8n), `growth_events`/`growth_funnels`/`growth_retention`/`growth_metrics_daily` (Mixpanel via n8n).

### Communications Module (5-tab dashboard at `/comunicaciones`)

The `/comunicaciones` route implements a WhatsApp communications dashboard with 5 tabs: Campañas, Métricas, Automatizaciones, Templates, Configuración.
- **Templates tab**: CRUD for WhatsApp message templates with Meta approval workflow. Bulk CSV upload via `BulkUploadTemplatesModal`. Individual/bulk delete (from Meta + local DB).
- **Template Queue System**: Bulk uploads use a queue to avoid saturating Meta's review. Templates are assigned to batches of 3 (`queue_batch` column). A cron job (every 15 min) or manual button calls `process-template-queue` API to: check active batch status with Meta → advance to next batch when resolved → submit next batch. Queue status banner in Templates tab shows progress with auto-polling every 60s.
- **API Routes** (`app/api/communication/`): `submit-template`, `bulk-submit-templates`, `delete-template`, `check-template-status`, `process-template-queue` (queue processor, CRON_SECRET or auth), `queue-status` (GET, queue state for UI), `send-broadcast`, `sync-broadcast`, `send-test`, `event` (webhook), `status-update` (webhook).
- **Tables**: `comm_templates` (with `queue_batch`, `queue_priority` for queue system), `comm_broadcasts`, `comm_variables`, `comm_test_contacts`, `comm_message_logs`, `comm_automations`.
- **Kapso integration**: `lib/kapso.ts` — `submitTemplateToMeta`, `getTemplateStatus`, `deleteTemplateFromMeta`, `createBroadcast`, `addBroadcastRecipients`, `sendBroadcast`, `getBroadcastStatus`, `sendTemplateMessage`.
- **Components**: `components/comunicaciones/` — Templates, BulkUploadTemplatesModal, Campanias, Metricas, Automatizaciones, Configuracion.

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
- **RLS**: Ads/web/sync data restricted to superadmin. Organic data accessible to users with `mod_marketing`.
- **n8n workflows**: 8 workflows (MKT_ prefix) sync data from Meta/Google/TikTok/YouTube/GA4. Documented in `temp-docs/Marketing/n8n_workflows.md`.
- **Components**: `components/marketing/` — ResumenTab, OrganicTab, SyncTab, ads/ (AdsOverview, PlatformCard, CampaignTable), organic/ (OrganicOverview, PlatformMetrics, YouTubeMetrics), web/ (WebAnalytics, PagesCatalog), conversions/ (ConversionsSection), shared/ (DateRangePicker, SyncStatus, EmptyState, useDateRange, useMarketingData).

### Product Module (Backlog | Roadmap | Experimentos)

The `/producto` route implements a product management system with three independent tabs:
- **Backlog tab**: TanStack-style table with RICE scoring (Reach×Impact×Confidence/Effort), inline-editable cells, sorted by score. Quick-create row at bottom. Items can be promoted to Roadmap or Experimentos via PromoteForm.
- **Roadmap tab** (phase=`delivery` in DB): Kanban board (dnd-kit) with 3 columns: En diseño, En progreso, Terminado. Simple task-like cards showing title, owner email, and dates. Dragging to "Terminado" auto-triggers FinalizeModal. Quick-create button ("+ Nueva tarea"). No project linking.
- **Experimentos tab** (phase=`discovery` in DB): Notion-style table with 17 columns and horizontal scroll (`min-w-[1800px]`). Inline editing with auto-save (1500ms debounce for text, immediate for dropdowns/checkboxes). Sticky "Experimento" column. Click name to open SidePeek with full experiment fields. Quick-create row at bottom.
- **SidePeek**: Right-side drawer (480px) for initiative detail editing. Auto-save with 1500ms debounce. Contains PromoteForm (backlog→roadmap/experimentos), experiment data fields (discovery phase), finalize button (delivery phase).
- **FinalizeModal**: Marks initiative as finalized and creates a `company_events` calendar entry.
- **No interaction between Roadmap and Experimentos** — tabs are independent. No escalation from experiments to roadmap.
- **Table**: `product_initiatives` with RICE columns, `experiment_data` JSONB (includes `result: 'won'|'lost'|'inconclusive'|'pending'`), self-referencing `parent_id`, and `phase`/`status` workflow. Paused delivery items auto-move to `design` on load.
- **Components**: `components/producto/` — BacklogTable, QuickCreateRow, SidePeek, PromoteForm, RoadmapKanban, ExperimentosTable, InitiativeCard, FinalizeModal.

## Language

The application UI and commit messages are in Spanish.
