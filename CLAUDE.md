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

All pages use the Next.js App Router under `app/`. Every page is a client component (`"use client"`) that fetches data directly from Supabase via the client SDK. There is no API route layer — components query Supabase tables and call RPC functions directly.

### Authentication & Authorization

- `context/AuthContext.tsx` provides a global `useAuth()` hook exposing `session`, `user`, `isLoading`, and the `supabase` client instance.
- `components/AuthGuard.tsx` wraps protected pages; redirects to `/login` if unauthenticated.
- Roles: `superadmin`, `Dueño` (owner), regular member. Finance and revenue pages are restricted to `superadmin`/`Dueño`. Admin panel is `superadmin` only.
- Role info is fetched via the `get_user_role_and_team_info` RPC.

### Key Routes

| Route | Purpose |
|---|---|
| `/` | Main dashboard — tasks, projects, activity feed |
| `/projects/[id]` | Project detail with Kanban board (drag-and-drop) |
| `/calendar` | FullCalendar event management with team-colored events |
| `/finance` | Transaction management, multi-currency, CAC tracking |
| `/revenue` | Revenue dashboard with country/provider/plan filters |
| `/admin/teams` | Superadmin team administration |
| `/settings/team` | Team member management |

### Data Layer

- All Supabase queries happen client-side inside components (no server actions or API routes).
- RPC functions used: `get_team_members`, `get_team_members_by_active_team`, `get_user_role_and_team_info`, `add_member_to_active_team`, `remove_team_member`.
- Types are centralized in `lib/types.ts` — key entities: `Task`, `Project`, `CompanyEvent`, `Transaction`, `Account`, `Category`, `MonthlyMetric`.

### Supabase Edge Functions (`supabase/functions/`)

Five Deno/TypeScript edge functions handle email notifications via Resend:
- `send-event-notification` — new calendar events
- `send-assignment-notification` — task assignments
- `notify-mentions` — @mentions in comments
- `invite-user-to-team` — team invitations
- `send-custom-invite` — custom invitation emails

### Component Patterns

- Forms use controlled state; `EditTaskForm` auto-saves with 1500ms debounce.
- Modals use a generic `Modal` component with click-outside-to-close.
- Kanban uses dnd-kit with `PointerSensor` (8px activation distance).
- Task statuses: `Por Hacer`, `En Progreso`, `Hecho`.
- Brand colors: primary red `#ff8080`, secondary blue `#3c527a`, background `#F8F8F8`, text `#383838`.

## Language

The application UI and commit messages are in Spanish.
