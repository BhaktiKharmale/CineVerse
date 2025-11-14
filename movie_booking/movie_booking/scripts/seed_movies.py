"""Seed the database with example movies.

Run with the backend venv activated:
python scripts/seed_movies.py
"""
from app.database.database import SessionLocal, Base, engine
from app.database import models


def seed():
    # ensure tables exist
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(models.Movie).count()
        if existing:
            print(f"DB already has {existing} movie(s); skipping seeding.")
            return

        samples = [
            {"title": "The Great Adventure", "description": "An epic journey.", "duration": 120, "language": "English", "rating": "PG-13"},
            {"title": "Comedy Night", "description": "Laughs for everyone.", "duration": 95, "language": "English", "rating": "PG"},
            {"title": "Sci-Fi Saga", "description": "Futuristic thrills.", "duration": 140, "language": "English", "rating": "PG-13"},
        ]
        for s in samples:
            m = models.Movie(**s)
            db.add(m)
        db.commit()
        print("Seeded movies successfully.")
    finally:
        db.close()


if __name__ == '__main__':
    seed()
