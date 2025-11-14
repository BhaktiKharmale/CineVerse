from sqlalchemy.orm import Session
from app.database import models

# --------- Movie Management ---------

def create_movie(
    db: Session,
    title: str,
    genre: str | None = None,
    description: str | None = None,
    duration: str | None = None,
    release_date: str | None = None,
    poster_filename: str | None = None,
    poster_url: str | None = None,
    language: str | None = None,
    rating: str | None = None,
):
    """
    Accept either poster_filename (local path like /images/x.jpg) or poster_url (remote).
    We'll store whichever is provided; if both provided, poster_filename takes precedence.
    """
    # prefer explicit poster_filename, otherwise use poster_url
    filename = poster_filename or poster_url

    new_movie = models.Movie(
        title=title,
        genre=genre,
        description=description,
        duration=duration,
        release_date=release_date,
        language=language,
        rating=rating,
        poster_filename=filename
    )
    db.add(new_movie)
    db.commit()
    db.refresh(new_movie)
    return new_movie

def update_movie(db: Session, movie_id: int, **kwargs):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise ValueError("Movie not found")
    for key, value in kwargs.items():
        # map poster_url -> poster_filename if needed
        if key == "poster_url":
            setattr(movie, "poster_filename", value)
        else:
            setattr(movie, key, value)
    db.commit()
    db.refresh(movie)
    return movie

def delete_movie(db: Session, movie_id: int):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise ValueError("Movie not found")
    db.delete(movie)
    db.commit()
    return True

# --------- Screen Management ---------

def create_screen(db: Session, name: str):
    screen = models.Screen(name=name)
    db.add(screen)
    db.commit()
    db.refresh(screen)
    return screen

def create_showtime(db: Session, movie_id: int, screen_id: int, start_time: str, end_time: str | None = None):
    showtime = models.Showtime(
        movie_id=movie_id, screen_id=screen_id, start_time=start_time, end_time=end_time)
    db.add(showtime)
    db.commit()
    db.refresh(showtime)
    return showtime
