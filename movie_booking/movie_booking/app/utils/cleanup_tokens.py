"""
Utility to clean up expired tokens from the blacklist.
Run this periodically (e.g., via cron job) to prevent the blacklist from growing indefinitely.
"""

from datetime import datetime
from sqlalchemy.orm import Session
from app.database.database import SessionLocal
from app.database import models
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def cleanup_expired_tokens(db: Session = None):
    """
    Remove expired tokens from the blacklist.
    Tokens that have already expired don't need to be in the blacklist anymore
    since they can't be used for authentication.
    
    Args:
        db: Database session (optional, will create one if not provided)
    
    Returns:
        Number of tokens removed
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    
    try:
        now = datetime.utcnow()
        
        # Find all expired tokens
        expired_tokens = db.query(models.BlacklistedToken).filter(
            models.BlacklistedToken.expires_at < now
        ).all()
        
        count = len(expired_tokens)
        
        if count > 0:
            # Delete expired tokens
            db.query(models.BlacklistedToken).filter(
                models.BlacklistedToken.expires_at < now
            ).delete(synchronize_session=False)
            
            db.commit()
            logger.info(f"Cleaned up {count} expired tokens from blacklist")
        else:
            logger.info("No expired tokens to clean up")
        
        return count
        
    except Exception as e:
        logger.error(f"Error cleaning up expired tokens: {e}")
        db.rollback()
        return 0
    finally:
        if close_db:
            db.close()


if __name__ == "__main__":
    """
    Run this script directly to clean up expired tokens.
    Example: python -m app.utils.cleanup_tokens
    """
    logger.info("Starting token cleanup...")
    removed = cleanup_expired_tokens()
    logger.info(f"Token cleanup complete. Removed {removed} expired tokens.")
