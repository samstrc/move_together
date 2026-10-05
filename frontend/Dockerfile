# React + Vite frontend (development). Started by compose.yaml in the repo root.
FROM node:24-alpine

WORKDIR /app

# Install dependencies first so Docker can cache this step until
# package.json / package-lock.json change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host makes the dev server reachable from outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
