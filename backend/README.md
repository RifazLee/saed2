# SAED Express + MySQL backend

## Prerequisites
- Node.js 18+ (Node 20 LTS recommended)
- MySQL 8.0+ / MariaDB with InnoDB and JSON support
- Python 3.10+ for the optional spglib service
- cPanel hosting plan that explicitly enables Node.js applications. Niagahoster plan capabilities differ; confirm Node.js Application Manager / Setup Node.js App with support before deployment.

## Local setup
1. Create database and database user in cPanel/MySQL.
2. Import `migrations/001_initial.sql` using phpMyAdmin.
3. Copy `.env.example` to `.env`, then set DB credentials, APP_ORIGIN, JWT_SECRET.
4. Install Node packages: `npm install`.
5. Create the first operator using the one-time bootstrap script:
   `node scripts/create-operator.js operator@your-domain.com 'STRONG_PASSWORD' admin`
6. Start API: `npm start`. Check `/api/health`.

## spglib service
Install separately where Python processes are supported:
```
cd crystallography-service
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8100
```
Set `SPGLIB_URL=http://127.0.0.1:8100` for the Express process. The spglib service must be reachable only from localhost/private network and must not be exposed publicly without access controls.

Important: if the hosting plan cannot run a persistent Python service, host this small service on a VPS/private compute service and set SPGLIB_URL to its private HTTPS endpoint. If spglib is unavailable, API deliberately refuses to validate material; metric-only calculations are never marked as fully allowed.

## cPanel / Niagahoster deployment
- Confirm that your exact package has Node.js application support, SSH/Terminal, and the required Node version. cPanel docs state Node.js is only available when the hosting provider enables it.
- Create MySQL DB/user in cPanel and grant ALL PRIVILEGES to that DB.
- Upload `backend/` outside `public_html` if possible; set the cPanel Node application root to this folder and startup file `app.js`.
- Set environment variables in Setup Node.js App / Application Manager; do not upload `.env` to public_html.
- Install dependencies in the application root (`npm install --omit=dev`), restart the app, and test `/api/health`.
- Build frontend using `npm run build`; upload `dist/` to the domain document root. Set `VITE_API_BASE_URL=https://api.your-domain.com` at frontend build time, or proxy `/api` to Express through a private subdomain/reverse proxy if supported.
- If your cPanel account only supports PHP/MySQL and has no Node.js application feature, this backend cannot run on that shared-hosting plan. Use a Node.js VPS or a supported Node hosting plan; MySQL can remain on the hosting account only if remote connections are permitted and secured.

## API outline
- `POST /api/auth/login`
- `GET /api/materials`
- `GET /api/materials/validated`
- `POST /api/materials` (auth)
- `POST /api/materials/:id/calculate` (auth)
- `POST /api/materials/:id/validate` (auth)
- `GET /api/materials/:id`
- `GET /api/materials/:id/versions` (auth)
- `DELETE /api/materials/:id` (auth)

No material seed/demo rows are created.
