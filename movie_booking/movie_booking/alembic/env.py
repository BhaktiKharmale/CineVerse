import os
import sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from sqlalchemy.ext.asyncio import create_async_engine
from alembic import context

# Add project root to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# -------------------------------------------------
# Load environment variables from .env automatically
# -------------------------------------------------
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# -------------------------------------------------
# Import models and database setup
# -------------------------------------------------
from app.database.database import Base, SQLALCHEMY_DATABASE_URL

# Alembic Config object
config = context.config

# Setup logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for autogenerate
target_metadata = Base.metadata

# -------------------------------------------------
# Resolve DB URL (sync or async)
# -------------------------------------------------
database_url = (
    os.getenv("DATABASE_URL_ASYNC")
    or os.getenv("DATABASE_URL")
    or SQLALCHEMY_DATABASE_URL
)

# Alembic needs a sync URL for some operations
if database_url.startswith("postgresql+asyncpg"):
    sync_url = database_url.replace("+asyncpg", "")
else:
    sync_url = database_url

config.set_main_option("sqlalchemy.url", sync_url)

# -------------------------------------------------
# Migration functions
# -------------------------------------------------
def run_migrations_offline():
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online():
    """Run migrations in 'online' mode."""
    connectable = create_async_engine(database_url, poolclass=pool.NullPool)

    async with connectable.begin() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


# -------------------------------------------------
# Choose async or offline mode dynamically
# -------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    import asyncio
    asyncio.run(run_migrations_online())
