# Convergence Backend

Node.js / Express backend for the Convergence SUST Prelims hackathon project.
Local JSON is the default primary data source. PostgreSQL through
[Neon](https://neon.tech) is still available as an optional integration.

## Deploying to Render

This repo ships with a [Render Blueprint](https://render.com/docs/blueprint-spec)
at [`render.yaml`](../render.yaml) that provisions a single free-tier Web
Service using the project `Dockerfile`.

### One-time setup

1. Push this repo to GitHub (or fork it).
2. In the Render dashboard: **New → Blueprint** → point at this repo.
3. Render will detect `render.yaml` and pre-fill the service config.
   `rootDir` is set to `backend` and `runtime` to `docker`, so Render
   builds the image from `./Dockerfile`.
4. `DATABASE_URL` is optional. Add it in the Render dashboard only if you
   want to test or use Neon/Postgres.
5. Click **Apply**. Render installs deps via the `Dockerfile`, runs
   `node src/index.js`, and assigns a `*.onrender.com` URL.

### How it runs

- **Root dir:** `backend/` (Render builds from there, so the
  `Dockerfile` it sees is this directory's).
- **Build:** multi-stage `Dockerfile` (deps → runtime, Node 20 Alpine).
- **Start:** `node src/index.js` → binds `0.0.0.0:$PORT` (Render sets
  `PORT` automatically; the Dockerfile also `EXPOSE 3000` and sets a
  container-level `HEALTHCHECK` against `/health`).
- **Health check:** Render pings `GET /health` every 30 s. The
  endpoint returns `{ status: "ok", uptime, timestamp }`.
- **Auto-deploy:** Every push to the connected branch triggers a
  rebuild and zero-downtime redeploy.

### Free-tier caveats

- The service **spins down after ~15 min of inactivity**. The first
  request after a cold start can take 20–40 s; subsequent requests are
  fast. Use a paid plan or an external uptime pinger if you need
  always-on.
- Outbound connections and bandwidth are limited on the free tier —
  fine for an API, but watch for heavy DB scans on Neon.
- HTTPS is automatic on `*.onrender.com`; no cert provisioning needed.

## Local development

```bash
cd backend
cp .env.example .env       # optional local overrides
npm install
npm run dev                # nodemon
```

### Run the same image locally (Docker)

The image Render builds can be built and run on your machine too —
great for parity testing.

```bash
# from repo root
docker build -t convergence-backend ./backend
docker run --rm -p 3000:3000 --env-file backend/.env convergence-backend
```

## Smoke-testing the production boot path locally

```bash
cd backend
docker build -t convergence-backend .
docker run --rm -p 3000:3000 --env-file .env convergence-backend
# in another terminal:
curl http://localhost:3000/health
curl http://localhost:3000/test-db
curl http://localhost:3000/test-sql-db   # optional; requires DATABASE_URL
```

## Health endpoints

- `GET /health` — process liveness; always 200 if the server is up.
- `GET /test-db` — exercises the primary source. By default this is the
  local JSON file, so it does not require `DATABASE_URL`.
- `GET /test-sql-db` — optional Neon/Postgres probe; returns 500 if
  `DATABASE_URL` is missing or invalid.
