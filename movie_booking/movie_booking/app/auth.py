# app/auth.py

import os
from datetime import datetime, timedelta
from typing import Optional, Union

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.database import models
from app.database.database import get_db
from app.utils import hash_password as utils_hash_password
from app.utils import verify_password as utils_verify_password

load_dotenv()

# =====================================
# ✅ Configurations
# =====================================
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))


# =====================================
# ✅ Password Hashing (re-exported helpers)
# =====================================
def hash_password(password: str) -> str:
    """Hash a plain password (re-exported for backward compatibility)."""
    return utils_hash_password(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify if plain password matches hashed password (re-exported)."""
    return utils_verify_password(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Alias for backward compatibility."""
    return hash_password(password)

# =====================================
# ✅ JWT Helpers
# =====================================
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/superadmin/login")

def create_access_token(data: dict) -> str:
    """Create a new JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT token."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

# =====================================
# ✅ Current User Fetcher
# =====================================
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Union[models.User, models.Admin]:
    """Return the current user (Admin/User) from token."""
    # Check if token is blacklisted
    blacklisted = db.query(models.BlacklistedToken).filter(
        models.BlacklistedToken.token == token
    ).first()
    if blacklisted:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked (logged out)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        role = payload.get("role")
        if not email or not role:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    if role == "user":
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    admin = db.query(models.Admin).filter(models.Admin.email == email).first()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    admin.role = "superadmin" if getattr(admin, "is_superadmin", False) else "admin"
    return admin

# =====================================
# ✅ Role-based Access Control
# =====================================
def require_role(required_role: str):
    """Dependency to restrict access to users with a given role."""
    def checker(current_user=Depends(get_current_user)):
        role = getattr(current_user, "role", None)
        if role not in [required_role, "superadmin"]:
            raise HTTPException(
                status_code=403,
                detail=f"Access forbidden: {required_role} role required"
            )
        return current_user
    return checker
