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
- `context/PermissionsContext.tsx` provides `usePermissions()` hook exposing `role`, `mod_tareas`, `mod_calendario`, `mod_revenue`, `mod_finanzas`, `isLoading`, `refetch`.
- `components/AuthGuard.tsx` wraps protected pages; redirects to `/login` if unauthenticated.
- `components/ModuleGuard.tsx` wraps page content; checks module-level permissions. Shows "Acceso Denegado" if user lacks permission, or "Cuenta Pendiente" if user has no role (registered without invitation).
- **Roles**: `superadmin` (full access), `member` (org employee), `invitado` (external collaborator).
- **Permissions**: Per-module booleans in `user_permissions` table: `mod_tareas`, `mod_calendario`, `mod_revenue`, `mod_finanzas`. Superadmin always has all permissions.
- **Registration**: Invitation-only via `/register?invite_token=TOKEN`. Without token, registration is blocked.
- Role info + permissions fetched via `get_user_role_and_permissions` RPC.

### Key Routes

| Route | Purpose |
|---|---|
| `/` | Main dashboard — tasks, projects, activity feed |
| `/projects/[id]` | Project detail with Kanban board (drag-and-drop) |
| `/calendar` | FullCalendar event management with team-colored events |
| `/finance` | Transaction management, multi-currency, CAC tracking |
| `/revenue` | Revenue dashboard with country/provider/plan filters |
| `/admin/users` | Superadmin user & permissions administration |
| `/settings/team` | Organization member management |

### Data Layer

- All Supabase queries happen client-side inside components (no server actions or API routes).
- **RPC functions**: `get_user_role_and_permissions`, `get_all_members`, `get_all_users_admin`, `update_user_role`, `update_user_module_permission`, `deactivate_user`, `add_member`, `remove_member`, `create_task_v2`, `create_project`, `get_project_members`, `get_projects_with_members`, `get_my_assigned_tasks_with_projects`.
- **Key tables**: `profiles` (role), `user_permissions` (module booleans), `org_settings` (singleton org config), `invitations` (invite tokens).
- Types are centralized in `lib/types.ts` — key entities: `Task`, `Project`, `CompanyEvent`, `Transaction`, `Account`, `Category`, `MonthlyMetric`, `UserPermissions`.

### Supabase Edge Functions (`supabase/functions/`)

Five Deno/TypeScript edge functions handle email notifications via Resend:
- `send-event-notification` — new calendar events
- `send-assignment-notification` — task assignments
- `notify-mentions` — @mentions in comments
- `invite-user-to-team` — user invitations (assigns role + permissions based on email domain)
- `send-custom-invite` — custom invitation emails with registration token

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

## Language

The application UI and commit messages are in Spanish.
