# CineVerse Admin Dashboard

The CineVerse admin interface is a fully client-side experience that consumes the existing `/api/admin/*` endpoints. This document summarises the routing, key components, and API calls to help engineers extend or debug the dashboard.

## Routing & Auth

- `Navbar` exposes an **Admin Login** button (always visible). Auth state is handled by `AdminAuthContext`.
- Public routes:
  - `/admin/login` → `pages/admin/Login.tsx`
- Protected routes under `/admin` (guarded by `AdminRouteGuard` + `AdminAuthContext`):
  - `/admin/movies`
  - `/admin/screens`
  - `/admin/showtimes`
  - `/admin/seat-tools`
  - `/admin/bookings`
  - `/admin/requests`
  - `/admin/settings`

The shell is rendered by `pages/admin/DashboardLayout.tsx`, which mounts `AdminSidebar`, handles responsive navigation, and exposes layout context via `useAdminLayout`.

## Shared Admin Components

Located in `src/components/admin/`:

- `AdminSidebar` / `AdminHeader`: chrome and navigation.
- `AdminRouteGuard`: wraps protected routes and redirects unauthenticated sessions to `/admin/login`.
- `DataTable`: generic table for list views.
- `FormDialog` / `ConfirmDialog`: modal helpers for CRUD flows.
- `SeatMatrixViewer`: groups seat payloads (row/column/status) into a visual grid for quick QA.

All admin API calls use `axiosClient`, which already injects the `cine_admin_token` bearer token and dispatches `cineverse:admin-unauthorized` on 401 so the auth provider can logout automatically.

## Pages & Endpoint Mapping

| Page | Path | Endpoints |
|------|------|-----------|
| Movies | `/admin/movies` | `GET /api/admin/movies`, `POST /api/admin/movies`, `PUT /api/admin/movies/{movie_id}`, `DELETE /api/admin/movies/{movie_id}` |
| Screens | `/admin/screens` | `GET /api/admin/screens`, `POST /api/admin/screens`, `PUT /api/admin/screens/update`, `DELETE /api/admin/screens/{screen_id}`, `GET /api/admin/screens/{screen_id}/seats` |
| Showtimes | `/admin/showtimes` | `POST /api/admin/showtimes`, `POST /api/admin/showtimes/{showtime_id}/ensure-seats`, plus read-only lookups via `GET /api/admin/movies` and `GET /api/admin/screens` for dropdowns |
| Seat Tools | `/admin/seat-tools` | `GET /api/admin/screens`, `GET /api/admin/screens/{screen_id}/seats`, `POST /api/admin/showtimes/{showtime_id}/ensure-seats` |
| Bookings (Offline) | `/admin/bookings` | `POST /api/admin/admin/book-offline` |
| Requests | `/admin/requests` | `POST /api/admin/request_movie` |
| Settings | `/admin/settings` | `POST /api/admin/register` (optional new admin invite), plus logout via `AdminAuthContext.logout()` |

## UI Notes

- Layout uses the existing dark CineVerse palette: primary backgrounds `#0b0b0f` / `#0f0f16`, accent `#f6c800`.
- Every mutation renders optimistic feedback using `react-hot-toast` (success/error) and disables buttons while requests are in-flight.
- Destructive actions go through `ConfirmDialog`.
- Empty states encourage the next action (e.g., "Create Movie" when no data).
- Accessibility: buttons include `aria-label` where context is ambiguous; tables remain keyboard accessible.

## Extending the Dashboard

- When adding a new admin page, place the route component under `src/pages/admin/` and wire it into `router/Router.tsx` as a child of the `/admin` route.
- Reuse `AdminHeader` for consistent top bars. `useAdminLayout()` exposes `openSidebar` for mobile nav toggling.
- Add new dialogs or viewers inside `src/components/admin/` to keep admin-specific UI grouped.
- Follow the existing pattern for error handling: log to console for debugging, surface the API message via `toast.error`, and ensure we reset loading state in `finally` blocks.

For more detail on the overall frontend organisation, refer to `docs/FRONTEND_STRUCTURE.md`.
