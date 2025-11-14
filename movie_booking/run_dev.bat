@echo off
REM Development server with reload exclusion for scripts/
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001 --reload-exclude "scripts/*"

