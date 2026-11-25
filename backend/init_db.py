"""Set up an empty database with db/init.sql (tables + seed data).

Docker does this for local development. A hosted database (e.g. on Render)
starts empty, so the server runs this before starting:

    python init_db.py && uvicorn main:app ...

It does nothing if the tables already exist, so it's safe to run on every
start. Never wipes or changes an existing database.
"""

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv()

INIT_SQL = Path(__file__).resolve().parent.parent / "db" / "init.sql"


def main() -> None:
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        exists = conn.execute("SELECT to_regclass('public.users') IS NOT NULL").fetchone()[0]
        if exists:
            print("init_db: tables already exist, nothing to do")
            return
        with conn.transaction():
            conn.execute(INIT_SQL.read_text())
        print("init_db: created tables and seed data from db/init.sql")


if __name__ == "__main__":
    main()
