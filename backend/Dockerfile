# FastAPI backend (development). Started by compose.yaml in the repo root.
FROM python:3.13-slim

WORKDIR /app

# Install dependencies first so Docker can cache this step until
# requirements.txt changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# --reload restarts the server when a .py file changes (compose mounts this
# folder into the container, so your edits show up right away).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
