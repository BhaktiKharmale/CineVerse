"""
Utility modules for the application

This package re-exports functions from the legacy app.utils module
to maintain backward compatibility while adding new utilities.

Note: There is both app/utils.py (legacy file) and app/utils/ (package).
This __init__.py loads functions from the legacy file and re-exports them.
"""
import sys
import importlib.util
from pathlib import Path

# Load the parent utils.py file (app/utils.py) using importlib
# We need to load it as a separate module to avoid circular imports
_current_file = Path(__file__).resolve()
_utils_file = _current_file.parent.parent / "utils.py"

if _utils_file.exists():
    # Load utils.py as a module
    module_name = "app_utils_legacy_module"
    spec = importlib.util.spec_from_file_location(module_name, str(_utils_file))
    if spec and spec.loader:
        utils_legacy = importlib.util.module_from_spec(spec)
        # Execute the module to load its functions
        spec.loader.exec_module(utils_legacy)
        
        # Re-export all functions from utils.py
        generate_otp = utils_legacy.generate_otp
        send_email = utils_legacy.send_email
        hash_password = utils_legacy.hash_password
        verify_password = utils_legacy.verify_password
        generate_token = getattr(utils_legacy, 'generate_token', None)
        validate_user_email = getattr(utils_legacy, 'validate_user_email', None)
    else:
        raise ImportError(f"Could not create spec for utils.py from {_utils_file}")
else:
    raise ImportError(f"utils.py not found at {_utils_file}. Current file: {_current_file}, Looking for: {_utils_file}")

# Also export poster_url functions (these are in the package)
# Import these after loading legacy utils to avoid any potential circular import issues
try:
    from .poster_url import (
        get_frontend_origin,
        path_to_filename,
        normalize_poster_url,
        get_poster_full_url,
    )
except ImportError as e:
    # If poster_url import fails, log but don't fail the whole module
    import logging
    logging.warning(f"Could not import poster_url functions: {e}")
    # Define dummy functions to prevent AttributeError
    def get_frontend_origin() -> str: return "http://localhost:3001"
    def path_to_filename(path: str) -> str: return path.split('/')[-1] if path else ""
    def normalize_poster_url(raw): return raw
    def get_poster_full_url(raw): return raw

__all__ = [
    'generate_otp',
    'send_email', 
    'hash_password',
    'verify_password',
    'generate_token',
    'validate_user_email',
    'get_frontend_origin',
    'path_to_filename', 
    'normalize_poster_url',
    'get_poster_full_url',
]

