"""Database connection for the API.

Uses a connection pool: a handful of open connections to PostgreSQL that
requests borrow and give back, instead of reconnecting on every request.
The connection string comes from DATABASE_URL in backend/.env.
"""

import os

from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

load_dotenv()

# open=False: main.py opens the pool when the server starts.
# dict_row: query results come back as dicts ({"name": "Couch", ...}),
# which FastAPI can return as JSON directly.
pool = ConnectionPool(
    os.environ["DATABASE_URL"],
    kwargs={"row_factory": dict_row},
    open=False,
)


def get_db():
    """FastAPI dependency that lends an endpoint a database connection.

    The transaction is committed when the endpoint finishes, or rolled back
    if it raises an error. Use it like:

        def my_endpoint(db = Depends(get_db, scope="function")):
            db.execute("SELECT ...")

    scope="function" commits before the response is sent. Without it, FastAPI
    sends the response first and commits after, so a request made right after
    (e.g. sending the first message to a chat that was just created) could
    miss what the previous one saved.
    """
    with pool.connection() as conn:
        yield conn
