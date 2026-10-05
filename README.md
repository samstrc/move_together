# Move Together

A web app for roommates and couples to plan their move together: a shared
shopping list, a group budget, and Dolly, an AI shopping assistant.

**Team — The Relational Rebels:** Sam Strickler, Caius Price, Qiaozhi Yong

## Tech stack

- **Frontend:** React + Vite (JavaScript) - `frontend/`
- **Backend:** FastAPI (Python) - `backend/`
- **Database:** PostgreSQL 18 in Docker - `compose.yaml`, schema in `db/init.sql`

## Running it

**Database** — needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) running

```
docker compose up -d
```

This starts Postgres on `localhost:5432` (user `postgres`, password `password`,
database `move_together`) and loads the tables and sample data from
`db/init.sql` the first time. After changing `init.sql`, rebuild with
`docker compose down -v && docker compose up -d` (this wipes the data).

**Frontend** — opens at http://localhost:5173

```
cd frontend
npm install
npm run dev
```

**Backend** — opens at http://localhost:8000 (API docs at `/docs`). Start the
database first.

```
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

## Status

The frontend pages are built but use fake data from
`frontend/src/data/sampleData.js`. The backend is connected to the database
(`backend/db.py`) and serves the item list at `/moves/{move_id}/items`;
more endpoints are on the way.

Planned work is tracked in [GitHub Issues](https://github.com/samstrc/move_together/issues).
