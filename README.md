# Movie Booking — Local Dev README

This repository contains a FastAPI backend and a React (Vite) frontend. This README covers running both locally, seeding the database, and troubleshooting.

## Backend (FastAPI)

Location: `movie_booking/movie_booking`

1. Create and activate the venv (Windows PowerShell):

```powershell
cd "d:\P99SOFT Taining\final project\movie_booking\movie_booking"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install requirements:

```powershell
pip install -r requirements.txt
```

3. (Optional) Seed sample movies:

```powershell
# with venv activated
python scripts/seed_movies.py
```

4. Start the backend:

```powershell
# development (reload) - IMPORTANT: exclude scripts/ to prevent infinite reloads
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001 --reload-exclude "scripts/*"

# Or use the provided script:
.\run_dev.bat

# production (no reload)
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

**Important**: The `--reload-exclude "scripts/*"` flag prevents infinite reload loops when files in `scripts/` change.

- API root: `http://127.0.0.1:8001/`
- Movies endpoint: `http://127.0.0.1:8001/api/movies`

5. Configure environment variables (optional):

Create a `.env` file in `movie_booking/`:
```env
FRONTEND_ORIGIN=http://localhost:3001
```

This tells the backend where to point poster URLs. Defaults to `http://localhost:3001` if not set.

## Frontend (Vite / Node)

Location: `frontend`

### API Configuration

The frontend fetches movies from the backend API. Configure the API base URL using environment variables:

1. Create a `.env` file in the `frontend` directory (if it doesn't exist)
2. Add the following:

```env
# Frontend Environment Variables
# Use 127.0.0.1 consistently for local development

# API Base URL (backend)
VITE_API_BASE=http://127.0.0.1:8001

# Socket.IO URL (same as API base)
VITE_SOCKET_URL=http://127.0.0.1:8001

# AI Agent Feature Flag
VITE_AGENT_ENABLED=true
```

**Important Notes**: 
- **Always use `127.0.0.1` (not `localhost`)** to match backend CORS configuration
- The default API base is `http://127.0.0.1:8001` if `VITE_API_BASE` is not set
- The Home page fetches movies from `${VITE_API_BASE}/api/movies`
- Socket.IO connects to `${VITE_SOCKET_URL}/socket.io` for AI chat
- Expected response format: Array of movie objects with fields: `id`, `title`, `poster_url`, `language`, `genre`, etc.
- Poster images are served from `/public/images/` directory (e.g., `/images/poster.jpg`)
- Missing posters fallback to `/images/placeholder_poster.jpg`

### CORS Configuration

The backend is configured to allow requests from:
- `http://localhost:3000`, `http://localhost:3001`, `http://localhost:3002`, `http://localhost:5173`
- `http://127.0.0.1:3000`, `http://127.0.0.1:3001`, `http://127.0.0.1:3002`, `http://127.0.0.1:5173`

**For best compatibility, use `127.0.0.1` consistently in your frontend `.env` file.**

### Setup

1. Ensure Node.js (LTS) is installed (https://nodejs.org/)
2. Install deps and run dev:

```powershell
cd "d:\P99SOFT Taining\final project\frontend"
npm install
npm run dev
```

- Vite dev server runs on port 3000 by default: `http://localhost:3000`
- Frontend calls the backend at the `VITE_API_BASE` environment variable. See `.env`.

3. Run frontend via Node (serve production build):

```powershell
npm run build
# optional: set API_TARGET when running server.js
$env:API_TARGET = "http://localhost:8000"
npm start
```

## Run both locally (development)

Option A — two terminals (recommended):
- Terminal 1: start backend (see backend steps)
- Terminal 2: start frontend `npm run dev`

Option B — one command (PowerShell) using npm `concurrently` (requires Node):

```powershell
cd frontend
npm install
npm run dev:all
```

`dev:all` runs the venv python uvicorn command and Vite concurrently.

## Troubleshooting

- CORS errors in the browser: ensure frontend runs on a whitelisted origin (by default http://localhost:3000). Backend CORS is enabled for that origin in `app/main.py`.
- If API requests go to `http://localhost:8000/api/...` but backend returns 404, ensure backend is running and the `/api` prefix is present (we mount routers under `/api`).
- If `node` or `npm` commands are not found, install Node.js and ensure it's in PATH.
- If `python -m uvicorn` complains about missing packages, install them with `pip install -r requirements.txt` and `pip install python-multipart`.

## Test the integration

1. Start backend and frontend.
2. Open the frontend at http://localhost:3000 and check the Home page — it will request `/api/movies` and display results.
3. Use the backend seed script to add movies before testing.

---
If you'd like, I can now:
- Run the `scripts/seed_movies.py` here to populate sample movies (I have Python/venv access), then re-check `http://127.0.0.1:8000/api/movies` to confirm the seed worked.
- Attempt to start the frontend here if you install Node or confirm Node is available.

Tell me which you'd like next.
