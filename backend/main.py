"""Move Together API (FastAPI).

Run it from this folder with:
    uvicorn main:app --reload

Then open http://localhost:8000/docs to see and test every endpoint.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Move Together API")

# Let the React app (running on localhost:5173) call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    """Quick way to check the server is running."""
    return {"status": "ok"}


@app.get("/items")
def list_items():
    """Example endpoint for the shared list.

    TODO: Read items from PostgreSQL instead of returning fake data.
    """
    return [
        {"id": 1, "name": "Couch", "category": "Living room", "price": 650, "status": "needed"},
        {"id": 2, "name": "Shower curtain", "category": "Bathroom", "price": 25, "status": "bought"},
    ]
