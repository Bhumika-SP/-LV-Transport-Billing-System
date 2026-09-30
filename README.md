# LV Transport Billing System

Internal billing and driver settlement system for **LV Transport**. It covers monthly
company settlements, trips (manual and bulk import), driver earnings, expenses,
advances, driver settlements, payments, and LV profit.

```
LV PROFIT = ACTUAL COMPANY AMOUNT RECEIVED − TOTAL FINALIZED DRIVER SETTLEMENTS
```

## Repository layout

```
backend/    Express 5 REST API, Prisma (MySQL)
frontend/   React + Vite + Tailwind SPA
docs/       Architecture, database/ERD, API, business rules, deployment
```

## Prerequisites

- Node.js 22 (`.nvmrc`), npm 10+
- MySQL 8.0

## Local setup

1. **Create the database.** In development you may use your local root account in
   `DATABASE_URL`. A dedicated user is shown below and is required in production:

   ```sql
   CREATE DATABASE lv_billing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'lv_app'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
   GRANT ALL PRIVILEGES ON lv_billing.* TO 'lv_app'@'localhost';
   -- Prisma Migrate needs a temporary shadow database in development:
   GRANT CREATE, ALTER, DROP, REFERENCES ON *.* TO 'lv_app'@'localhost';
   ```

2. **Configure the environment.**

   ```bash
   cp backend/.env.example backend/.env     # set DATABASE_URL
   cp frontend/.env.example frontend/.env
   cp backend/.env.test.example backend/.env.test   # tests; DB name must end in _test
   ```

3. **Install and migrate.**

   ```bash
   npm install
   npm run db:migrate
   ```

4. **Run.**

   ```bash
   npm run dev          # API on :4000, web on :5173 (proxies /api to the API)
   ```

   - Web: http://localhost:5173
   - Health: http://localhost:4000/health (returns 503 if the DB is unreachable)

## Scripts (root)

| Script               | Purpose                                 |
| -------------------- | --------------------------------------- |
| `npm run dev`        | API and web together                    |
| `npm test`           | Backend test suite (Vitest + Supertest) |
| `npm run lint`       | ESLint for both workspaces              |
| `npm run format`     | Prettier                                |
| `npm run build`      | Production frontend build               |
| `npm run db:migrate` | Create or apply Prisma migrations (dev) |
| `npm run db:studio`  | Prisma Studio                           |

## Deployment (summary)

- **API (Render):** build `npm ci && npx prisma migrate deploy`, start `npm start -w backend`, health check path `/health`.
- **Web (Vercel):** root `frontend`, build `npm run build`, output `dist`. Set the Render URL in `frontend/vercel.json` rewrites.
- **DB:** managed MySQL 8 with automated backups.

Full guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| Document                                    | Contents                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Stack, layering, money and date conventions, security, documented assumptions |
| [DATABASE.md](docs/DATABASE.md)             | Migrations, full ERD, constraints, rate-history rules                         |
| [API.md](docs/API.md)                       | Response envelope, error codes, endpoints                                     |
| [BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Locked formulas, workflow rules, acceptance scenarios                         |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)         | Vercel, Render, managed MySQL, storage, backups                               |

## Build phases

| Phase | Scope                                                                 | Status      |
| ----- | --------------------------------------------------------------------- | ----------- |
| 0     | Project initialization                                                | ✅ Complete |
| 1     | Foundation (skeleton, health, error handling, logging)                | ✅ Complete |
| 2     | Authentication & RBAC                                                 |             |
| 3     | Master data (companies, drivers, vehicles, types, rates, assignments) |             |
| 4     | Company settlement                                                    |             |
| 5     | Trips                                                                 |             |
| 6     | Bulk import                                                           |             |
| 7     | Driver earnings                                                       |             |
| 8     | Expenses & advances                                                   |             |
| 9     | Driver settlement engine                                              |             |
| 10    | Driver payments                                                       |             |
| 11    | LV profit                                                             |             |
| 12    | Dashboards                                                            |             |
| 13    | Reports                                                               |             |
| 14    | GST / finance                                                         |             |
| 15    | Documents & notifications                                             |             |
| 16    | Audit                                                                 |             |
| 17    | Testing                                                               |             |
| 18    | Production hardening                                                  |             |
| 19    | Deployment                                                            |             |
