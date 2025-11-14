# CineVerse Frontend Structure

This document captures the current layout of the CineVerse frontend after the consolidation pass. It is intended as a quick orientation for engineers making further changes.

## Directory Overview

```
src/
  api/                     // HTTP clients (axios wrappers, fetch helpers)
  assets/                  // Component-specific static assets (SVG, logos)
  components/              // Reusable UI organized by domain
    admin/                 // Admin dashboard layout pieces & shared widgets
    chat/                  // Conversational assistant widget + helpers
    cinemas/               // Cinemas page header and filters
    common/                // Shared primitives (Loader, Toast container, etc.)
    home/                  // Homepage hero, quick book, carousels, tabbed content
    layout/                // Global chrome (Navbar, Footer)
    movies/                // MovieCard and movie-specific widgets
    offers/                // OfferCard + grid views
    payment/               // Payment summary cards, options, ticket preview
    seating/               // Seat map renderer + seat legends
    showtimes/             // Compact showtime modal + supporting UI
  constants/               // Static constants used across the app
  context/                 // React context providers (auth, modal, app state)
  hooks/                   // Custom hooks
  libs/                    // Shared TypeScript types (Movie, Cinema, Showtime, Offer, etc.)
  pages/                   // Route-level pages mounted by the router
    Home/index.tsx         // /home (Splash.tsx still handles "/")
    Showtimes/index.tsx    // /showtimes (+legacy /booking alias)
    Cinemas/index.tsx      // /cinemas
    Offers/index.tsx       // /offers
    Movie/Details.tsx      // /movie/:id
    Booking/
      SeatSelection.tsx    // /seat-selection & /seats/:showtimeId
      PaymentSummary.tsx   // /payment-summary (shim to legacy flow)
      PaymentSuccess.tsx   // /payment-success & /success/:bookingId
      UPIStatus.tsx        // /payment/upi-status
      _deprecated/         // Legacy checkout/payment files kept for references
    Auth/
      Login.tsx            // /login
      Register.tsx         // /register
    Admin/
      Login.tsx            // /admin/login
      DashboardLayout.tsx  // Shell for /admin/*
      Movies.tsx           // /admin/movies
      Screens.tsx          // /admin/screens
      Showtimes.tsx        // /admin/showtimes
      SeatTools.tsx        // /admin/seat-tools
      Bookings.tsx         // /admin/bookings
      Requests.tsx         // /admin/requests
      Settings.tsx         // /admin/settings
      hooks/useAdminLayout.ts
    MyBookings.tsx         // /my-bookings
    Splash.tsx             // entry splash before redirecting to /home
  router/                  // Route configuration
  services/                // API integrations and helper services
  styles/                  // Global stylesheets (Tailwind entry + legacy page styles)
  utils/                   // Pure utilities (booking context helpers, formatters, etc.)
```

## Components & Styling

- Tailwind is the default styling approach. Component-scoped CSS (e.g., showtime modal) lives beside the component in the same folder.
- Duplicated variants were merged into canonical components:
  - All movie thumbnails, including the Cinemas grid, use `components/movies/MovieCard.tsx`.
  - Showtime flows use `components/showtimes/BookTicketsSection.tsx` and `ShowtimeModal.tsx`.
- Icons are sourced exclusively from `lucide-react`. The legacy `react-icons` dependency was removed.

## Types

- Shared domain types (`Movie`, `Cinema`, `Showtime`, `Offer`, etc.) live in `libs/types.ts`.
- Booking and payment-specific shapes remain in `types/booking.ts` to avoid breaking existing consumers. Import from these modules instead of redefining interfaces locally.

## Modals & Global Providers

- `context/ShowtimeModalContext.tsx` exposes `openModal` / `closeModal` helpers. Wrap new UI in the `ShowtimeModalProvider` (already applied in `App.tsx`) to reuse the compact booking overlay.
- `components/common/ToastContainer.tsx` is mounted once in `App.tsx` so toast notifications render globally.

## Pages & Routes

- All routes are defined in `router/Router.tsx`. When relocating a page file, update the import there but keep the path strings unchanged.
- Page-level components are responsible for rendering `Navbar` / `Footer` as needed.

## Utilities & Services

- Network calls should go through `services/*` (e.g., `movieService.ts`, `paymentService.ts`).
- Booking/session helpers (`bookingContext.ts`, `showtimeContext.ts`) live under `utils/`.

## Asset Conventions

- Runtime assets (posters, offer banners) stay under `public/`.
- Component-specific SVGs are co-located in `src/assets/`.

## Housekeeping Rules

- Follow PascalCase for components and camelCase for hooks/utilities.
- Use explicit relative imports (no deep barrel exports) to keep file locations obvious.
- Before adding new CSS files, prefer Tailwind classes or CSS modules placed next to the component.
- Remove unused files as part of routine work; run `npm run build` to confirm import health after deletions.
