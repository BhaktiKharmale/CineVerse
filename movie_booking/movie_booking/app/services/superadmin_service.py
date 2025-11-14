# app/services/superadmin_service.py

from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.database import models
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_password_hash
)

# ==============================================================
# 🔐 SuperAdmin Authentication and Management
# ==============================================================

def get_superadmin_by_username(db: Session, username: str):
    """Fetch a SuperAdmin by username."""
    return db.query(models.SuperAdmin).filter(models.SuperAdmin.username == username).first()


def authenticate_superadmin(db: Session, username: str, password: str):
    """Authenticate superadmin credentials and return access token."""
    superadmin = get_superadmin_by_username(db, username)
    if not superadmin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SuperAdmin not found"
        )

    if not verify_password(password, superadmin.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )

    access_token = create_access_token({"sub": superadmin.username, "role": "superadmin"})
    return {"access_token": access_token, "token_type": "bearer"}


def create_default_superadmin(db: Session):
    """Create a default SuperAdmin if not exists."""
    default_email = "kharmalepihu@gmail.com"
    existing = db.query(models.SuperAdmin).filter(models.SuperAdmin.email == default_email).first()

    if existing:
        print(f"ℹ️ SuperAdmin already exists: {default_email}")
        return existing

    new_superadmin = models.SuperAdmin(
        username="superadmin_pihu",
        email=default_email,
        password=get_password_hash("admin123")
    )
    db.add(new_superadmin)
    db.commit()
    db.refresh(new_superadmin)
    print("✅ Default SuperAdmin created successfully.")
    return new_superadmin

# ==============================================================
# 👑 SuperAdmin → Admin Management
# ==============================================================

def create_admin(db: Session, username: str, email: str, password: str):
    """Create a new admin user (only allowed for SuperAdmin)."""
    # Check if admin already exists
    existing_admin = db.query(models.Admin).filter(models.Admin.email == email).first()
    if existing_admin:
        raise ValueError("Email already exists")

    hashed_password = get_password_hash(password)

    # Use Admin model which has username field
    admin = models.Admin(
        name=username,  # Set name same as username
        username=username,
        email=email,
        password=hashed_password,
        role="admin"
    )

    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


# ==============================================================
# 👥 User Management
# ==============================================================

def list_users(db: Session, include_admins: bool = False):
    """Return all users (excluding admins by default)."""
    query = db.query(models.User)
    if not include_admins:
        query = query.filter(models.User.role == "user")
    return query.all()


def delete_user(db: Session, user_id: int):
    """Delete user by ID (cannot delete superadmin)."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    # Compare the actual string value, not the Column descriptor
    if getattr(user, "role", None) == "superadmin":
        raise ValueError("Cannot delete SuperAdmin")

    db.delete(user)
    db.commit()
    return True
