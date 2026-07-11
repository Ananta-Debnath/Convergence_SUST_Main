# Convergence_SUST_Preli

Node.js / Express backend for the **Convergence SUST Prelims** hackathon project.
PostgreSQL is hosted externally on [Neon](https://neon.tech), and the service is
designed to be deployed to [Render](https://render.com) as a Docker-based Web
Service.

## Tech stack

- **Runtime:** Node.js 20 (LTS)
- **Framework:** Express 4
- **Database:** Neon serverless Postgres via `@neondatabase/serverless`
- **Config:** `dotenv` for local development; real env vars on Render
- **Container:** Multi-stage `Dockerfile` (Alpine), non-root `node` user
- **Deploy target:** Render (Blueprint via `render.yaml`, runtime: `docker`)

## Project structure

```
.
├── render.yaml          # Render Blueprint (single Web Service, env: docker)
├── backend/
│   ├── Dockerfile       # Multi-stage production image
│   ├── .dockerignore    # Trimmed build context
│   ├── package.json
│   ├── .env.example     # Copy to .env for local dev
│   └── src/
│       ├── index.js     # Express app entrypoint
│       ├── routes/
│       └── controllers/
│           └── ...
└── README.md            # ← you are here
```

## Local development (npm)

```bash
cd backend
cp .env.example .env       # paste your Neon DATABASE_URL
npm install
npm run dev                # nodemon on :3000
```

Quick smoke-test:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/test-db   # requires a real DATABASE_URL
```

## Local development (Docker)

The same image that Render builds runs locally, which makes parity
between dev and prod much tighter.

```bash
# from repo root
docker build -t convergence-backend ./backend
docker run --rm -p 3000:3000 --env-file backend/.env convergence-backend
```

- `EXPOSE 3000` is set in the image; `--env-file` is the recommended way
  to inject `DATABASE_URL` without baking it into the image.
- The image includes a `HEALTHCHECK` that pings `/health`, so
  `docker ps` will show `(healthy)` once the app is up.

## Deploying to Render

This repo ships with a [Render Blueprint](https://render.com/docs/blueprint-spec)
at [`render.yaml`](./render.yaml) that provisions a single free-tier Web
Service using the project `Dockerfile`.

### One-time setup

1. Push this repo to GitHub (or fork it).
2. In the Render dashboard: **New → Blueprint** → point at this repo.
3. Render will detect `render.yaml` and pre-fill the service config.
   `rootDir` is set to `backend` and `runtime` to `docker`, so Render
   builds the image from `backend/Dockerfile`.
4. When prompted for `DATABASE_URL`, paste your Neon connection string
   (Neon console → Project → Connection Details). It is declared with
   `sync: false` so the Blueprint apply does not fail if the secret is
   not in the repo.
5. Click **Apply**. Render builds the Docker image, starts the
   service, and assigns a `*.onrender.com` URL.

### How it runs on Render

- **Runtime:** `docker`, image built from `backend/Dockerfile`.
- **Build context:** `./` (repo root), with `dockerContext: .` and
  `rootDir: backend` so Render `COPY`s from the correct subdirectory.
- **Start command:** `node src/index.js` (set in the `Dockerfile` `CMD`).
- **Port:** Render injects `PORT` at runtime; `src/index.js` already
  honors `process.env.PORT`.
- **Health check:** Render pings `GET /health` every 30 s.
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

## Environment variables

| Key           | Required | Where set                         | Notes                                       |
| ------------- | -------- | --------------------------------- | ------------------------------------------- |
| `DATABASE_URL`| yes      | Render dashboard (sync: `false`)  | Neon connection string, `sslmode=require`.  |
| `NODE_ENV`    | no       | Render (`production`)             | Set in `render.yaml`.                       |
| `PORT`        | no       | Render auto                       | Injected at runtime; `src/index.js` reads it.|

## Health endpoints

- `GET /health` — process liveness; always 200 if the server is up.
  Used by both Render and the Docker `HEALTHCHECK`.
- `GET /test-db` — exercises the Neon connection; returns 200 on
  success or 500 with `db: "disconnected"` if `DATABASE_URL` is
  missing or invalid.

## Troubleshooting

- **Build fails with "Cannot find module ..."** → make sure `npm ci`
  ran against the latest `package-lock.json`. Locally:
  `cd backend && rm -rf node_modules && npm ci`.
- **Container exits immediately** → check Render logs; most often a
  missing or malformed `DATABASE_URL`.
- **`/health` returns 500** → confirm the app started (Render logs)
  and that `PORT` is being read from the environment.