import time
import requests
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

BASE = 'http://127.0.0.1:8000'

# test user
email = 'test_e2e_user@example.com'
username = 'test_e2e'
import requests
import time
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

BASE = "http://127.0.0.1:8000"

payload = {
    "username": "e2e_test_user",
    "email": "e2e_test_user@example.com",
    "password": "TestPass123!"
}

print('Registering user...')
r = requests.post(f"{BASE}/user/register", json=payload)
print('Status:', r.status_code, 'Body:', r.text)

# Give server a moment to commit
time.sleep(1)

# connect to DB using DATABASE_URL
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    # fall back to defaults used by app
    DB_USER = os.getenv('DB_USER', 'postgres')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'Ganesh@1')
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = os.getenv('DB_PORT', '5432')
    DB_NAME = os.getenv('DB_NAME', 'ticket_booking')
    DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

print('Connecting to DB to read token...')
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
s = Session()
try:
    row = s.execute(text("SELECT verification_token, is_verified FROM users WHERE email=:email"), {"email": payload['email']}).fetchone()
    print('DB row:', row)
    if row and row[0]:
        token = row[0]
        print('Token found:', token)
        print('Calling verify endpoint...')
        vr = requests.get(f"{BASE}/user/verify-email?token={token}")
        print('Verify status:', vr.status_code, 'body:', vr.text)
        row2 = s.execute(text("SELECT verification_token, is_verified FROM users WHERE email=:email"), {"email": payload['email']}).fetchone()
        print('After verify DB row:', row2)
    else:
        print('No token found; user may not have been created or DB different')
finally:
    s.close()