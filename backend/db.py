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


def ensure_single_owner_invariant() -> None:
    """Repair existing groups and enforce exactly one owner in PostgreSQL.

    If a legacy group has multiple owners, the earliest-joined owner remains
    owner. Ownerless groups are repaired by promoting their earliest member;
    an empty group is restored to its creator.
    """
    with pool.connection() as conn:
        # Serialize startup migrations and prevent membership writes while the
        # existing rows are normalized and the constraints are installed.
        conn.execute("LOCK TABLE moves, move_members IN SHARE ROW EXCLUSIVE MODE")
        conn.execute(
            """
            INSERT INTO move_members (move_id, user_id, role)
            SELECT m.move_id, m.created_by, 'owner'
            FROM moves m
            WHERE NOT EXISTS (
                SELECT 1 FROM move_members mm WHERE mm.move_id = m.move_id
            )
            ON CONFLICT (move_id, user_id) DO NOTHING
            """
        )
        conn.execute(
            """
            WITH ranked_owners AS (
                SELECT move_id, user_id,
                       ROW_NUMBER() OVER (
                           PARTITION BY move_id ORDER BY joined_at, user_id
                       ) AS owner_rank
                FROM move_members
                WHERE role = 'owner'
            )
            UPDATE move_members mm
            SET role = 'member'
            FROM ranked_owners ro
            WHERE mm.move_id = ro.move_id
              AND mm.user_id = ro.user_id
              AND ro.owner_rank > 1
            """
        )
        conn.execute(
            """
            WITH ownerless_groups AS (
                SELECT DISTINCT ON (candidate.move_id)
                       candidate.move_id, candidate.user_id
                FROM move_members candidate
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM move_members owner
                    WHERE owner.move_id = candidate.move_id
                      AND owner.role = 'owner'
                )
                ORDER BY candidate.move_id, candidate.joined_at, candidate.user_id
            )
            UPDATE move_members mm
            SET role = 'owner'
            FROM ownerless_groups og
            WHERE mm.move_id = og.move_id AND mm.user_id = og.user_id
            """
        )
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_move_members_single_owner
            ON move_members (move_id) WHERE role = 'owner'
            """
        )
        conn.execute(
            """
            CREATE OR REPLACE FUNCTION enforce_exactly_one_move_owner()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            DECLARE
                affected_move_id INTEGER;
                affected_move_ids INTEGER[];
                owner_count INTEGER;
            BEGIN
                IF TG_TABLE_NAME = 'moves' THEN
                    affected_move_ids := ARRAY[NEW.move_id];
                ELSIF TG_OP = 'DELETE' THEN
                    affected_move_ids := ARRAY[OLD.move_id];
                ELSIF TG_OP = 'UPDATE' AND OLD.move_id IS DISTINCT FROM NEW.move_id THEN
                    affected_move_ids := ARRAY[OLD.move_id, NEW.move_id];
                ELSE
                    affected_move_ids := ARRAY[NEW.move_id];
                END IF;

                FOREACH affected_move_id IN ARRAY affected_move_ids LOOP
                    IF NOT EXISTS (
                        SELECT 1 FROM moves WHERE move_id = affected_move_id
                    ) THEN
                        CONTINUE;
                    END IF;

                    SELECT COUNT(*) INTO owner_count
                    FROM move_members
                    WHERE move_id = affected_move_id AND role = 'owner';

                    IF owner_count <> 1 THEN
                        RAISE EXCEPTION 'Move % must have exactly one owner', affected_move_id
                            USING ERRCODE = '23514';
                    END IF;
                END LOOP;
                RETURN NULL;
            END;
            $$
            """
        )
        conn.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger
                    WHERE tgname = 'moves_require_exactly_one_owner'
                      AND tgrelid = 'moves'::regclass
                      AND NOT tgisinternal
                ) THEN
                    CREATE CONSTRAINT TRIGGER moves_require_exactly_one_owner
                    AFTER INSERT ON moves
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION enforce_exactly_one_move_owner();
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger
                    WHERE tgname = 'members_require_exactly_one_owner'
                      AND tgrelid = 'move_members'::regclass
                      AND NOT tgisinternal
                ) THEN
                    CREATE CONSTRAINT TRIGGER members_require_exactly_one_owner
                    AFTER INSERT OR UPDATE OR DELETE ON move_members
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION enforce_exactly_one_move_owner();
                END IF;
            END;
            $$
            """
        )


def get_db():
    """FastAPI dependency that lends an endpoint a database connection.

    The transaction is committed when the endpoint finishes, or rolled back
    if it raises an error. Use it like:

        def my_endpoint(db = Depends(get_db)):
            db.execute("SELECT ...")
    """
    with pool.connection() as conn:
        yield conn
