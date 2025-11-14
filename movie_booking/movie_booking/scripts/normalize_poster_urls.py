"""
One-time migration script to normalize poster_url values in the database.

This script:
1. Finds all movies with Windows filesystem paths in poster_url
2. Converts them to web-safe paths (/images/filename.jpg)
3. Updates the database

Usage:
    python -m movie_booking.scripts.normalize_poster_urls
"""
import sys
import os
from pathlib import Path
from typing import cast

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.database.database import SessionLocal
from app.database import models
from app.utils.poster_url import normalize_poster_url

def normalize_all_poster_urls():
    """Normalize all poster URLs in the database"""
    db = SessionLocal()
    
    try:
        movies = db.query(models.Movie).all()
        updated_count = 0
        
        print(f"Found {len(movies)} movies in database\n")
        
        for movie in movies:
            # Store value to avoid SQLAlchemy Column type issues
            # At runtime, movie.poster_url is the actual value (str | None), not a Column
            current_url = cast(str | None, movie.poster_url)
            if current_url is None or current_url == '':
                continue
            
            # Normalize the URL
            normalized = normalize_poster_url(current_url)
            
            # Only update if it changed
            if normalized != current_url:
                old_url = current_url
                movie.poster_url = normalized
                updated_count += 1
                print(f"  [{movie.id}] {movie.title}")
                print(f"    Old: {old_url}")
                print(f"    New: {normalized}\n")
        
        if updated_count > 0:
            db.commit()
            print(f"✅ Successfully updated {updated_count} movie poster URLs\n")
        else:
            print("✅ All poster URLs are already normalized\n")
        
        # Show summary
        print("📊 Summary:")
        for movie in movies:
            poster_url = cast(str | None, movie.poster_url)
            if poster_url is not None and poster_url != '':
                status = "✅" if poster_url.startswith(('/images/', 'http://', 'https://')) else "⚠️"
                print(f"  {status} [{movie.id}] {movie.title}: {poster_url}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("🔄 Normalizing poster URLs in database...\n")
    normalize_all_poster_urls()
    print("\n✨ Done!")
    print("\n📝 Documentation for future inserts:")
    print("  - Place file at: frontend/public/images/<filename>")
    print("  - Store in DB: /images/<filename> (or a CDN URL)")

