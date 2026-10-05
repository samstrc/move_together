# Move Together

A web app for roommates and couples to plan their move together: a shared
shopping list, a group budget, and Dolly, an AI shopping assistant.

**Team - The Relational Rebels:** Sam Strickler, Caius Price, Qiaozhi Yong

## Getting started

You only need [Docker Desktop](https://www.docker.com/products/docker-desktop/), and it has to be running.

**1. Create the backend settings file** (first time only):

```
cp backend/.env.example backend/.env
```

Open `backend/.env` and replace `SECRET_KEY=change-me` with the output of
`openssl rand -hex 32`.

**2. Start everything:**

```
docker compose up -d
```

The first run takes a minute or two while Docker builds everything and loads
the sample data.

**3. Open the app:** http://localhost:5173

Log in with any sample account: `sam@example.com`, `caius@example.com`, or
`qiaozhi@example.com`. The password for all three is `password123`.

## What's running

| | Address | Code |
|---|---|---|
| App (React + Vite) | http://localhost:5173 | `frontend/` |
| API (FastAPI) | http://localhost:8000/docs | `backend/` |
| Database (PostgreSQL 18) | `localhost:5432` | `db/init.sql` |

Code changes show up on their own, so you don't need to restart anything.

## Database

Connect from your computer (VS Code PostgreSQL extension, `psql`, etc.) with:

```
postgresql://relationalrebels:password@localhost:5432/move_together
```

or enter the parts separately: host `localhost`, port `5432`, database
`move_together`, user `relationalrebels`, password `password`.

- **Tables and sample data** come from `db/init.sql`. It runs only once, when
  the database is first created, so after editing it (or pulling someone
  else's changes to it), reset the database:
  `docker compose down -v && docker compose up -d`. This deletes all data.
- **Your data is kept** between `docker compose down` and `up`. Only `down -v`
  wipes it.
- **Inside Docker, the backend uses `db` as the host instead of `localhost`**,
  because `localhost` inside a container means that container itself.
  `compose.yaml` sets this for you, so `backend/.env` keeps the `localhost`
  address.

## Useful commands

| Command | What it does |
|---|---|
| `docker compose up -d` | Start everything |
| `docker compose down` | Stop everything (your data is kept) |
| `docker compose logs -f api` | Show backend output and errors (`web` for the frontend) |
| `docker compose up -d --build` | Rebuild after changing `requirements.txt` or `package.json` |
| `docker compose down -v && docker compose up -d` | Reset the database to the sample data in `db/init.sql` |

## Troubleshooting

- **`env file ... not found`**: you skipped step 1.
- **The app loads but logging in fails**: run `docker compose logs api`. If it
  says to set `SECRET_KEY`, fix `backend/.env`, then run `docker compose up -d`
  again.
- **"Port is already allocated"**: something else is using port 5173, 8000, or
  5432, such as an `npm run dev` or `uvicorn` you started yourself. Stop it
  and try again.
- **Database changes from `git pull` aren't showing up**: reset the database
  (see [Database](#database)).

## Status

Sign up and log in work end to end, and the shared list is served from the
database. The other pages still use sample data from
`frontend/src/data/sampleData.js` until their endpoints are built.

Planned work is tracked in [GitHub Issues](https://github.com/samstrc/move_together/issues).
