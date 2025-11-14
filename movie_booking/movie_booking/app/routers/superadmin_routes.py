# app/routers/superadmin_routes.py

from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Body, Path
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database import schemas
from app.services import superadmin_service
from app.auth import verify_password, create_access_token

router = APIRouter(prefix="/superadmin", tags=["SuperAdmin"])

# ==============================================================#
# 🔐 SuperAdmin Login
# ==============================================================#
@router.post("/login")
def superadmin_login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Authenticate SuperAdmin and return JWT access token."""
    try:
        superadmin = superadmin_service.get_superadmin_by_username(db, form_data.username)

        if not superadmin:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        # Ensure password is not None before verification
        if superadmin.password is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        if not verify_password(form_data.password, str(superadmin.password)):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        token_data = {"sub": superadmin.username, "role": "superadmin"}
        access_token = create_access_token(token_data)

        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")


# ==============================================================#
# ✅ Create Admin
# ==============================================================#
@router.post("/create-admin", status_code=status.HTTP_201_CREATED)
def create_admin(admin_data: schemas.SuperAdminCreateAdmin, db: Session = Depends(get_db)):
    """
    Create a new admin.
    Expects a JSON body with admin fields: name, email, password.
    """
    try:
        admin = superadmin_service.create_admin(db, admin_data.name, admin_data.email, admin_data.password)
        return admin
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ==============================================================#
# 📋 List Users
# ==============================================================#
@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    """Return list of all users."""
    users = superadmin_service.get_all_users(db)
    return users


# ==============================================================#
# 🗑 Delete User
# ==============================================================#
@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK)
def delete_user(user_id: int = Path(..., description="ID of the user to delete"), db: Session = Depends(get_db)):
    """Delete a user by id."""
    success = superadmin_service.delete_user(db, user_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found or already deleted")
    return {"detail": "User deleted"}


# ==============================================================#
# ➕ Create Movie
# ==============================================================#
@router.post("/movies", status_code=status.HTTP_201_CREATED)
def create_movie(movie_data: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """
    Create a new movie (admin action).
    Expects JSON body containing movie fields required by your service.
    """
    try:
        movie = superadmin_service.create_movie(db, movie_data)
        return movie
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ==============================================================#
# ✏️ Update Movie
# ==============================================================#
@router.put("/movies/{movie_id}")
def update_movie(
    movie_id: int = Path(..., description="ID of the movie to update"),
    movie_data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Update movie by id."""
    updated = superadmin_service.update_movie(db, movie_id, movie_data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movie not found")
    return updated


# ==============================================================#
# 🗑 Remove Movie
# ==============================================================#
@router.delete("/movies/{movie_id}", status_code=status.HTTP_200_OK)
def remove_movie(movie_id: int = Path(..., description="ID of the movie to remove"), db: Session = Depends(get_db)):
    """Remove movie by id."""
    success = superadmin_service.remove_movie(db, movie_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movie not found or already removed")
    return {"detail": "Movie removed"}


# ==============================================================#
# ✅ Approve Movie Request
# ==============================================================#
@router.put("/approve-movie-request/{request_id}")
def approve_movie_request(request_id: int = Path(..., description="ID of movie request"), db: Session = Depends(get_db)):
    """
    Approve a pending movie request (e.g. user-submitted movie that needs approval).
    """
    approved = superadmin_service.approve_movie_request(db, request_id)
    if not approved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movie request not found or already processed")
    return {"detail": "Movie request approved"}


# ==============================================================#
# ✅ Approve Admin Request
# ==============================================================#
@router.post("/approve_admin_request/{request_id}")
def approve_admin_request(request_id: int = Path(..., description="ID of admin creation request"), db: Session = Depends(get_db)):
    """
    Approve an admin request (promote user/request to admin).
    """
    approved = superadmin_service.approve_admin_request(db, request_id)
    if not approved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin request not found or already processed")
    return {"detail": "Admin request approved"}
