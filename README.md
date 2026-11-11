# SAED – Material Reference Database + Express/MySQL

This archive contains the updated React/Vite SAED frontend, an Express API backed by MySQL, and a private Python/spglib systematic-absence service.

## Start here
1. Read `DEPLOYMENT_NIAGAHOSTER.md`.
2. Set up MySQL using `backend/migrations/001_initial.sql`.
3. Configure `backend/.env.example` values in your server environment.
4. Install backend dependencies and create the first operator.
5. Configure the spglib microservice before validating any material.
6. Build and deploy the frontend with `VITE_API_BASE_URL`.

See `backend/README.md` for API and local setup details. The database starts empty; no demo materials or default operators are inserted.
