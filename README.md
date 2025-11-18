# CineVerse — Movie Ticket Booking System

Modern, full‑stack movie ticketing platform with real‑time seat locking, OTP authentication, and payment flow.

### Project Overview

- **Purpose**: Browse movies, view showtimes, select seats with real‑time updates, pay, and download tickets.
- **Key features**:
  - Movies, theatres, and showtimes listing
  - Seat map with premium/regular sections (12 rows × 18 seats)
  - Real‑time seat locking over WebSockets and Redis
  - OTP-based signup/login, JWT sessions, logout with token blacklist
  - Payment order creation and verification (Razorpay or dev fallback)
  - Ticket PDF generation and download
  - Admin/superadmin routes for management (API)
  - Dockerized deployment (frontend, backend, Postgres, Redis)

---

## Frontend

- **Stack**: React 18 + Vite + TypeScript + TailwindCSS
- **Location**: `frontend/`
- **Build/runtime**:
  - Dev server: Vite on port 3001 (see `frontend/vite.config.mjs`)
  - Production: built static assets served by Nginx (see `frontend/Dockerfile`)

### Main modules
- Movies & details: `src/pages/Movies`, `src/pages/Movie`
- Showtimes: `src/pages/Showtimes`, `src/components/showtimes/*`
- Seat booking: `src/pages/Booking`, `src/components/seating/*`, `src/services/showtimeService.ts`
- Payment summary & checkout: `src/pages/Checkout`, `src/components/payment/*`, `src/services/paymentService.ts`
- Authentication: `src/context/AuthProvider.tsx`, `src/hooks/useAuth.tsx`
- State management: React Context + local hooks; `zustand` present
- Real‑time: `src/services/websocketService.ts` with `socketManager.ts`
- Admin UI (basic): `src/admin/*` and `src/pages/Admin/*`

### API requests and environment
- All API calls go through:
  - `src/api/axiosClient.ts` with base URL: `${VITE_API_BASE}/api`
  - Interceptor strips duplicate `/api` in paths, attaches `Authorization: Bearer <token>` when available
- WebSocket endpoint:
  - Builds URL from `VITE_API_BASE` (switches ws/wss), connects to `/api/showtimes/{id}/seats/ws`
- Environment variables (Vite):
  - `VITE_API_BASE` (default `http://127.0.0.1:8001`)
  - `VITE_SOCKET_URL` (optional; websockets derive from `VITE_API_BASE`)
  - `VITE_AGENT_ENABLED` (optional feature flag)

Example `.env`:

```env
VITE_API_BASE=http://127.0.0.1:8001
VITE_AGENT_ENABLED=true
```

### Run frontend locally

```powershell
cd "d:\P99SOFT Taining\final project\frontend"
npm install
npm run dev
```

- Dev URL: `http://localhost:3001`
- To build production assets:

```powershell
npm run build
```

---

## Backend

- **Stack**: Python 3.11, FastAPI, SQLAlchemy (PostgreSQL), Alembic, Redis (seat locks), Uvicorn
- **Location**: `movie_booking/movie_booking/app`
- **Entry**: `app.main:app`
- **Routers mounted under** `/api`

### Architecture
- Controllers (routers): `app/routers/*.py` (public, user, admin, payments)
- Services: business logic (locks, payments, pdf) in `app/services/*`
- Database: `app/database` (`models.py`, `payment_models.py`, `database.py`)
- Middleware/CORS: configured in `app/main.py` (FastAPI `CORSMiddleware`)
- Validation: Pydantic schemas in `app/database/schemas.py` and inline models
- Error handling: HTTPException usage with logging

### Major routes (prefix `/api`)
- Public:
  - `GET /movies`, `GET /movies/{movie_id}`, `GET /movies/{movie_id}/showtimes`
  - `GET /theatres`, `GET /showtimes/{showtime_id}`
  - `GET /showtimes/{showtime_id}/seats`
  - Redis seat locks:
    - `POST /showtimes/{showtime_id}/redis-lock-seats`
    - `POST /showtimes/{showtime_id}/redis-unlock-seats`
    - `POST /showtimes/{showtime_id}/redis-extend-locks`
    - `GET  /showtimes/{showtime_id}/redis-inspect-locks?seat_ids=...`
  - WebSocket:
    - `WS /showtimes/{showtime_id}/seats/ws`
  - Health:
    - `GET /health`, `GET /health/redis`
- User/Auth (`/user`):
  - `POST /user/send-otp`, `POST /user/verify-otp`, `POST /user/register`
  - `POST /user/login`, `POST /user/logout`
  - `GET /user/me`, `GET /user/users`
- Payments (`/payments`):
  - `GET /payments/health`, `GET /payments/gateway-status`
  - `POST /payments/validate-locks`
  - `POST /payments/create-order`
  - `POST /payments/verify`
  - `POST /payments/webhook`
  - `GET /payments/bookings/{id}/ticket.pdf`

Root:
- `GET /` → health message
- `GET /api/cors-test`

### Environment variables (backend)
Configured in `app/core/config.py` and `docker-compose.yml`:
- Database:
  - `DATABASE_URL`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`
- Redis:
  - `REDIS_URL`, `SEAT_LOCK_TTL_MS` (default `180000`), `SEAT_LOCK_PREFIX` (default `cineverse`)
- Payments:
  - `PAYMENT_GATEWAY` (`razorpay` or fallback), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PAYMENTS_WEBHOOK_SECRET`
  - `PUBLIC_BASE_URL` (for absolute links in PDFs)
- CORS:
  - `FRONTEND_ORIGIN` (compose)
- Assistant (optional):
  - `OPENAI_API_KEY`

Example `.env` (local dev):

```env
DATABASE_URL=postgresql://postgres:Ganesh%401@127.0.0.1:5432/CineVerse
REDIS_URL=redis://127.0.0.1:6379/0
SEAT_LOCK_TTL_MS=180000
SEAT_LOCK_PREFIX=cineverse
PAYMENT_GATEWAY=razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
PAYMENTS_WEBHOOK_SECRET=
PUBLIC_BASE_URL=http://127.0.0.1:8001
FRONTEND_ORIGIN=http://127.0.0.1:3001
```

### Run backend locally

```powershell
cd "d:\P99SOFT Taining\final project\movie_booking\movie_booking"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001 --reload-exclude "scripts/*"
```

Optional data seeding:

```powershell
python scripts/seed_movies.py
```

---

## Database

- **Engine**: PostgreSQL 15 (Docker `postgres:15-alpine`)
- **Schema design** (core tables in `app/database/models.py`):
  - `users`, `admins`, `superadmins`
  - `movies`, `theatres`, `showtimes`
  - `bookings`, `blacklisted_tokens`
  - payments in `payment_models.py`: `orders`, `payments`
- **Relationships**:
  - `Movie 1—* Showtime *—1 Theatre`
  - `User 1—* Booking *—1 Showtime`
- **Migrations**: Alembic (`alembic/`), plus SQL in `migrations/`
- **Integration**: SQLAlchemy models reflect schema; dev auto‑create enabled

### Connecting and managing
- Local connection string example:
  - `postgresql://postgres:Ganesh@1@127.0.0.1:5432/CineVerse`
- Create tables (dev): app auto‑creates on startup; use Alembic for prod
- Restore backups: standard `psql`/`pg_restore`

---

## Docker & Deployment

`docker-compose.yml` defines:
- `postgres` (PostgreSQL 15)
- `redis` (Redis 7)
- `backend` (FastAPI: `movie_booking/Dockerfile`)
- `frontend` (Nginx + Vite build: `frontend/Dockerfile`)

Ports:
- Backend: host `${BACKEND_PORT:-8001}` → container `8001`
- Frontend: host `${FRONTEND_PORT:-3001}` → container `80`
- Postgres: host `${DB_PORT:-5432}` → container `5432`
- Redis: `6379`

Build and run:

```powershell
cd "d:\P99SOFT Taining\final project"
docker compose build
docker compose up -d
```

Environment via compose:
- Backend:
  - `DATABASE_URL=postgresql://${DB_USER:-postgres}:${DB_PASSWORD:-Ganesh@1}@postgres:5432/${DB_NAME:-CineVerse}`
  - `REDIS_URL=redis://redis:6379/0`
  - `SEAT_LOCK_TTL_MS`, `SEAT_LOCK_PREFIX`
  - `PAYMENT_GATEWAY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PAYMENTS_WEBHOOK_SECRET`
  - `PUBLIC_BASE_URL`, `FRONTEND_ORIGIN`
- Frontend build args:
  - `VITE_API_BASE`, `VITE_SOCKET_URL`, `VITE_AGENT_ENABLED`

EC2 deployment (outline):
1. Provision VM with Docker & Docker Compose
2. Expose ports 3001 and 8001 (or place behind Nginx/ALB)
3. Copy repository/CI deploy
4. Provide `.env`/compose env (do not commit secrets)
5. `docker compose up -d --build`

---

## Environment Variables — Reference

Frontend (Vite):
- `VITE_API_BASE` - Base API URL (e.g., `http://127.0.0.1:8001`)
- `VITE_AGENT_ENABLED` - Enable assistant features (optional)
- `VITE_SOCKET_URL` - Optional; websockets derive from `VITE_API_BASE`

Backend:
- `DATABASE_URL`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`
- `REDIS_URL`, `SEAT_LOCK_TTL_MS`, `SEAT_LOCK_PREFIX`
- `PAYMENT_GATEWAY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PAYMENTS_WEBHOOK_SECRET`
- `PUBLIC_BASE_URL`, `FRONTEND_ORIGIN`
- `OPENAI_API_KEY` (optional)

Database (compose):
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`

---

## API Base URL (local vs production)

- Local dev:
  - Backend: `http://127.0.0.1:8001`
  - Frontend `.env`: `VITE_API_BASE=http://127.0.0.1:8001`
- Production:
  - Set `VITE_API_BASE` to your public API URL (e.g., `https://api.yourdomain.com`)
  - Ensure backend CORS `allow_origins` includes your frontend origin

---

## Project Setup Guide (fresh machine)

1) Prerequisites:
- Node.js LTS, Python 3.11, Docker Desktop (optional for containerized run)

2) Local (without Docker):
- Start Postgres and Redis locally or via Docker
- Backend:
  ```powershell
  cd "d:\P99SOFT Taining\final project\movie_booking\movie_booking"
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1
  pip install -r requirements.txt
  setx DATABASE_URL "postgresql://postgres:Ganesh@1@127.0.0.1:5432/CineVerse"
  setx REDIS_URL "redis://127.0.0.1:6379/0"
  python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001 --reload-exclude "scripts/*"
  ```
- Frontend:
  ```powershell
  cd "d:\P99SOFT Taining\final project\frontend"
  echo VITE_API_BASE=http://127.0.0.1:8001 > .env
  npm install
  npm run dev
  ```

3) Full Docker:
```powershell
cd "d:\P99SOFT Taining\final project"
docker compose up -d --build
```

Open:
- Frontend: `http://localhost:3001`
- Backend: `http://localhost:8001/` and `http://localhost:8001/api/health`

---

## Additional Features

- Real‑time seats: WebSocket channel `/api/showtimes/{id}/seats/ws` broadcasts `seat_update`, `seat_locked`, `seat_released`
- Seat locking: Redis‑backed locks with TTL; graceful degradation if Redis unavailable
- Authentication:
  - Send OTP → Verify → Register (new users via Redis OTP flow)
  - Login (OAuth2 form), JWT attached by `axiosClient` interceptor
  - Logout blacklists token in DB
- Payment flow:
  - Create order (derives amount from seat prices or fallback)
  - Verify (signature for Razorpay; dev fallback supported)
  - Booking persisted; locks released; PDF generated; ticket downloadable

---

## Future Improvements

- Role‑based authorization for admin routes and UI
- City/theatre discovery and search filters
- Dedicated seat inventory tables per showtime
- Observability: structured logs, tracing, metrics
- CI/CD with migrations and data seeds

---

## Diagrams (text)

1) User selects movie → showtime → opens seat map  
2) Client connects WS, fetches seats, locks selected seats (Redis)  
3) Create order → pay → verify → booking persisted  
4) Locks released, ticket PDF generated, download link exposed  

---

Happy hacking! 🎬
