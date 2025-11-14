-- Migration: Add blacklisted_tokens table for logout functionality
-- Date: 2025-11-10
-- Description: Stores revoked JWT tokens to prevent their reuse after logout

CREATE TABLE IF NOT EXISTS blacklisted_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(500) UNIQUE NOT NULL,
    blacklisted_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

-- Add index on token for fast lookups during authentication
CREATE INDEX IF NOT EXISTS idx_blacklisted_tokens_token ON blacklisted_tokens(token);

-- Add index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_blacklisted_tokens_expires_at ON blacklisted_tokens(expires_at);

-- Optional: Add a comment
COMMENT ON TABLE blacklisted_tokens IS 'Stores JWT tokens that have been invalidated through logout';
COMMENT ON COLUMN blacklisted_tokens.token IS 'The full JWT token string';
COMMENT ON COLUMN blacklisted_tokens.blacklisted_on IS 'Timestamp when the token was blacklisted';
COMMENT ON COLUMN blacklisted_tokens.expires_at IS 'Original expiration time of the token (for cleanup)';
