# health_patch.py — idempotent addition of a /health route
try:
	app = None
	try:
		from app.main import app as imported_app  # type: ignore
		app = imported_app
	except Exception:
		try:
			from main import app as imported_app  # type: ignore
			app = imported_app
		except Exception:
			app = globals().get("app") or globals().get("application")

	if app and not any(k for k in getattr(app, 'routes', []) if getattr(k, 'path', None) == '/health'):
		@app.get("/health", tags=["health"])  # type: ignore
		def _health():
			return {"status": "ok"}
except Exception:
	# Safe no-op if app discovery fails; patch is idempotent and non-fatal
	pass


