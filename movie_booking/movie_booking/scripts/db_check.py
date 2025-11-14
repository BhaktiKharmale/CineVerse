from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv
load_dotenv()
email='test_e2e_user@example.com'
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DB_USER = os.getenv('DB_USER', 'postgres')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'Ganesh@1')
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = os.getenv('DB_PORT', '5432')
    DB_NAME = os.getenv('DB_NAME', 'ticket_booking')
    DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = None
try:
    engine = create_engine(DATABASE_URL)
    conn = engine.connect()
except Exception as e:
    print('Postgres connect failed, switching to sqlite:', e)
    here = os.path.dirname(__file__)
    sqlite_path = os.path.abspath(os.path.join(here, '..', 'movie_booking.db'))
    engine = create_engine(f"sqlite:///{sqlite_path}")
    conn = engine.connect()

res = conn.execute(text('SELECT email, verification_token, is_verified FROM users WHERE email=:e'), {'e':email})
row = res.fetchone()
print('db lookup:', row)
conn.close()