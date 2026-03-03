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
- `context/PermissionsContext.tsx` provides `usePermissions()` hook exposing `role`, `mod_tareas`, `mod_calendario`, `mod_revenue`, `mod_finanzas`, `mod_customer_success`, `isLoading`, `refetch`.
- `components/AuthGuard.tsx` wraps protected pages; redirects to `/login` if unauthenticated.
- `components/ModuleGuard.tsx` wraps page content; checks module-level permissions. Shows "Acceso Denegado" if user lacks permission, or "Cuenta Pendiente" if user has no role (registered without invitation).
- **Roles**: `superadmin` (full access), `member` (org employee), `invitado` (external collaborator).
- **Permissions**: Per-module booleans in `user_permissions` table: `mod_tareas`, `mod_calendario`, `mod_revenue`, `mod_finanzas`, `mod_producto`, `mod_customer_success`. Superadmin always has all permissions.
- **Registration**: Invitation-only via `/register?invite_token=TOKEN`. Without token, registration is blocked.
- Role info + permissions fetched via `get_user_role_and_permissions` RPC.

### Key Routes

| Route | Purpose |
|---|---|
| `/` | Main dashboard — tasks, projects, activity feed |
| `/projects` | Project listing with favorites, delete, invite members (uses `ProjectCard`) |
| `/projects/[id]` | Project detail with Kanban board (drag-and-drop) |
| `/calendar` | FullCalendar event management with team-colored events |
| `/finance` | Transaction management, multi-currency, CAC tracking |
| `/revenue` | Growth Dashboard — 8-tab growth analytics (Revenue, Country, Churn, Conversion, Acquisition, Behavior, Reports) |
| `/producto` | Product module (Backlog, Roadmap, Experimentos) |
| `/customer-success` | Customer Success dashboard (embedded Kali Analytics iframe) |
| `/admin/users` | Superadmin user & permissions administration |
| `/settings/team` | Organization member management |
| `/settings/notifications` | Per-user notification preferences (email/in-app toggles) |

### Data Layer

- All Supabase queries happen client-side inside components (no server actions or API routes).
- **RPC functions**: `get_user_role_and_permissions`, `get_all_members`, `get_all_users_admin`, `update_user_role`, `update_user_module_permission`, `deactivate_user`, `add_member`, `remove_member`, `create_task_v2`, `create_project`, `get_project_members`, `get_projects_with_members`, `get_my_assigned_tasks_with_projects`, `toggle_project_favorite`, `delete_project_and_tasks`, `migrate_tasks_and_delete_project`, `create_content_review`, `submit_review_response`, `get_review_history`, `get_notification_preferences`, `upsert_notification_preferences`, `get_all_notification_preferences`, `get_notification_recipients`, `get_executive_summary` (weekly KPIs → jsonb), `get_churn_renewal` (churn/renewal tables → jsonb; params: `p_plan_filter text`, `p_upcoming_days int`; returns `newPaid`/`renewed` split + `plan_options`), `get_conversion_funnel` (funnel + weekly cohorts → jsonb), `get_acquisition_stats` (country/channel cross-tables → jsonb), `get_revenue_by_country` (country×period matrix → jsonb).
- **Key tables**: `profiles` (role), `user_permissions` (module booleans), `org_settings` (singleton org config), `invitations` (invite tokens), `tasks` (uses `assignee_user_id` UUID column, not `assignee_id`), `content_reviews` (review rounds), `review_responses` (reviewer votes), `product_initiatives` (Dual-Track product items with RICE scoring), `notification_preferences` (per-user notification channel preferences), `project_favorites` (user-project favorite relation, managed via `toggle_project_favorite` RPC), `rev_orders` (payment orders with `client_type`, `plan_category`, `plan_duration` columns), `growth_users` (Bubble users sync), `growth_events` (Mixpanel events), `growth_funnels` (Mixpanel funnels), `growth_retention` (Mixpanel cohorts), `growth_metrics_daily` (DAU/WAU/MAU), `growth_report_config` (report recipients), `growth_report_log` (report send history), `growth_weekly_snapshots` (weekly computed metrics).
- Types are centralized in `lib/types.ts` — key entities: `Task`, `Project`, `CompanyEvent`, `Transaction`, `Account`, `Category`, `MonthlyMetric`, `UserPermissions`, `ProductInitiative`, `ExperimentData`.

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
- **Resumen Ejecutivo**: Weekly KPI grid — Revenue (total/new/recurring/ARPU) from `rev_orders`, Users (registrations/activation/conversion) from `growth_users`, Behavior (DAU/WAU/MAU) from `growth_metrics_daily`. WeekSelector for navigation.
- **Revenue**: Improved revenue explorer — granularity toggle (daily/weekly/monthly), stacked bars (Nuevo vs Renovación), pie charts (country/plan/provider/category), paginated detail table with `client_type`, `plan_category`, `plan_duration` columns.
- **Por País**: Matrix table — rows=countries, columns=periods (monthly/weekly/daily), year selector (2024-2026), optional YoY % growth overlay. Summary stats.
- **Churn & Renovación** (Fase 2): Weekly churn table, renewal tracking, actionable renewal list. Requires `growth_users`.
- **Conversión** (Fase 2+3): Funnel Registro→Activación→Paywall→Pago. Onboarding funnel from Mixpanel.
- **Adquisición** (Fase 2+3): Country×Status cross-table, Channel×Plan cross-table. Requires `growth_users` + `growth_events`.
- **Comportamiento** (Fase 3): DAU/WAU/MAU trends, retention cohorts, paywall insights. Requires Mixpanel pipeline.
- **Reportes** (Fase 4, superadmin only): Report recipients CRUD, send history, test send.
- **Components**: `components/growth/` — KpiCard, GrowthFilters, WeekSelector, ExecutiveSummary, RevenueTab, RevenueByCountry, ChurnRenewal, ConversionFunnel, AcquisitionTab, RetentionCohort, ReportConfig.
- **Data sources**: `rev_orders` (existing, enhanced), `growth_users` (Bubble Users via n8n), `growth_events`/`growth_funnels`/`growth_retention`/`growth_metrics_daily` (Mixpanel via n8n).

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
