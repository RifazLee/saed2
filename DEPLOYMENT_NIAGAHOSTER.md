# Deployment SAED on Niagahoster (Express + MySQL)

## Important compatibility check
Do not assume every Niagahoster shared-hosting package can run Node.js. Open cPanel and check whether **Setup Node.js App**, **Application Manager**, or **Web Apps** is available. cPanel's own documentation states Node.js is shown only when the hosting provider enables it for the account. If this feature is absent, ask Niagahoster support whether Node.js 18/20/22 + Passenger is enabled on your exact package. If not, deploy the Express API to a Node-capable VPS/host and use MySQL only if remote DB access is allowed.

## Recommended layout
- Frontend static build: domain document root (`public_html`)
- Express API: separate subdomain such as `api.your-domain.com`, application root outside `public_html`
- MySQL: cPanel database, never expose DB credentials to browser code
- spglib: private Python service on VPS/private server; not exposed to public internet

## Setup
1. Create MySQL database/user from cPanel > MySQL Databases and grant all privileges.
2. Import `backend/migrations/001_initial.sql` through phpMyAdmin.
3. Create Node.js app in cPanel with app root `saed-api`, startup file `app.js`, Node 18+.
4. Upload contents of `backend/` to the app root. Add environment variables from `backend/.env.example` in cPanel.
5. In Terminal, run `npm install --omit=dev`, then restart the Node.js application.
6. Create first operator from Terminal: `node scripts/create-operator.js admin@your-domain.com 'Use-A-Long-Unique-Password' admin`.
7. Configure private spglib service and `SPGLIB_URL`.
8. Build frontend with `VITE_API_BASE_URL=https://api.your-domain.com npm run build`, upload `dist/` to `public_html`.
9. Test `https://api.your-domain.com/api/health`, log in, create a Draft, calculate, then validate after spglib is online.

## Security
- Use HTTPS.
- Use a long random JWT_SECRET (32+ bytes).
- Keep `.env` outside public_html and do not commit it.
- Restrict DB user to the one SAED database.
- Restrict spglib endpoint to private network / localhost.
- Back up MySQL before schema updates.
- Do not create public operator registration. Create accounts via the CLI script.
