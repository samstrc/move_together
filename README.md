# Move Together

A web app for roommates and couples to plan their move together: a shared
shopping list, a group budget, and Dolly, an AI shopping assistant.

**Team — The Relational Rebels:** Sam Strickler, Caius Price, Qiaozhi Yong

## Tech stack

- **Frontend:** React + Vite (JavaScript) - `frontend/`
- **Backend:** FastAPI (Python) - `backend/`
- **Database:** PostgreSQL (not set up yet)

## Running it

**Frontend** — opens at http://localhost:5173

```
cd frontend
npm install
npm run dev
```

**Backend** — opens at http://localhost:8000 (API docs at `/docs`)

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
`frontend/src/data/sampleData.js`. The backend is a starter template and the
database isn't set up yet.

Planned work is tracked in [GitHub Issues](https://github.com/samstrc/move_together/issues).
