"""
Utility functions for normalizing movie poster URLs.

This module converts backend poster references (absolute filesystem paths,
Windows paths, URLs, or bare filenames) into front-end friendly URLs such
as `/images/<filename>` or a full origin-prefixed URL like
`http://localhost:3001/images/<filename>`.

Examples in this file use forward slashes to avoid escape-sequence issues.
"""
import os
from typing import Optional


def get_frontend_origin() -> str:
    """
    Get frontend origin from environment variable.

    Checks FRONTEND_ORIGIN env var, or defaults to http://localhost:3001.
    """
    frontend_origin = os.getenv("FRONTEND_ORIGIN")
    if frontend_origin:
        return frontend_origin.rstrip("/")

    # Default to common Vite dev server port
    return "http://localhost:3001"


def path_to_filename(path: str) -> str:
    """
    Extract filename from a path, handling both Windows \\ and Unix / separators.

    Examples:
    - D:/path/to/file.jpg -> file.jpg
    - /path/to/file.jpg  -> file.jpg
    - file.jpg           -> file.jpg
    """
    if not path:
        return ""

    # Normalize windows backslashes to forward slashes for splitting
    normalized = path.replace("\\", "/")
    filename = normalized.split("/")[-1]
    return filename


def normalize_poster_url(raw: Optional[str]) -> Optional[str]:
    """
    Normalize poster URL from filesystem path to web-safe path.

    If the DB value is an absolute path, convert to /images/<filename>.
    If it already starts with /images/ or http(s), leave as is.

    Examples:
    - Windows path: D:/path/to/public/images/foo.jpg  -> /images/foo.jpg
    - Unix path: /path/to/public/images/foo.jpg       -> /images/foo.jpg
    - Already normalized: /images/foo.jpg             -> /images/foo.jpg (unchanged)
    - HTTP URL: http://example.com/poster.jpg         -> http://example.com/poster.jpg (unchanged)
    - None -> None
    """
    if not raw:
        return None

    raw_str = str(raw).strip()
    if raw_str == "":
        return None

    # Already a web URL (http/https) - return as-is
    if raw_str.startswith(("http://", "https://")):
        return raw_str

    # Already a relative path starting with /images/ - return as-is
    if raw_str.startswith("/images/"):
        return raw_str

    # Absolute path (Windows or Unix): extract filename and convert to /images/<filename>
    # Check if it's an absolute path (starts with drive letter like "C:" or with "/")
    if (len(raw_str) > 1 and raw_str[1] == ":") or raw_str.startswith("/"):
        filename = path_to_filename(raw_str)
        if filename:
            return f"/images/{filename}"

    # If it contains path separators, extract filename
    if "/" in raw_str or "\\" in raw_str:
        filename = path_to_filename(raw_str)
        if filename:
            return f"/images/{filename}"

    # If it's just a filename, assume it's in /images/
    if raw_str and "/" not in raw_str and "\\" not in raw_str:
        return f"/images/{raw_str}"

    # Fallback: return original value (best-effort)
    return raw_str


def get_poster_full_url(raw: Optional[str]) -> Optional[str]:
    """
    Get full URL for poster, using normalize_poster_url and get_frontend_origin.

    If the result starts with /, prefix with get_frontend_origin().

    Args:
        raw: Raw poster URL from DB (may be absolute path or already normalized)

    Returns:
        Full URL (e.g., http://localhost:3001/images/foo.jpg) or original if already absolute
    """
    if not raw:
        return None

    normalized = normalize_poster_url(raw)
    if not normalized:
        return None

    # Already absolute URL - return as-is
    if normalized.startswith(("http://", "https://")):
        return normalized

    # Relative path - prepend frontend origin
    if normalized.startswith("/"):
        frontend_origin = get_frontend_origin()
        origin = frontend_origin.rstrip("/")
        return f"{origin}{normalized}"

    # Fallback: return normalized
    return normalized
