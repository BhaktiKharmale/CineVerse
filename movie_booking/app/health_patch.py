# health_patch.py — idempotent addition of a /health route

try:
	app = None
	try:
		from app.main import app  # type: ignore
	except Exception:
		try:
			from main import app  # type: ignore
		except Exception:
			app = globals().get("app") or globals().get("application")

	if app and not any(k for k in getattr(app, 'routes', []) if getattr(k, 'path', None) == '/health'):
		@app.get("/health", tags=["health"])  # type: ignore[attr-defined]
		def _health():
			return {"status": "ok"}
except Exception:
	# Silently ignore any issues to keep patch non-disruptive
	pass


