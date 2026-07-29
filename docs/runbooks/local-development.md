# Local development runbook

## Start dependencies

Start Docker Desktop's Linux engine, then:

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

Copy `.env.example` to the repository-root `.env.local` and populate
high-entropy local secrets. Root development, database, deployment, network,
and smoke commands load this single file for both applications. Only testnet
credentials are permitted.

Generate `OPERATOR_SESSION_TOKEN` as documented in
`docs/runbooks/operator-api.md` only when exercising the local operator API.

## Initialize

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Run

```bash
pnpm dev
```

The web process runs at `http://localhost:3000`. The executor is an always-on
separate process and must have C2FLR only when live processing is enabled.

## Xaman callbacks

Use an HTTPS tunnel with a stable callback for local Xaman testing. Configure
the exact `/api/webhooks/xaman` URL in the Xaman developer console. Never expose
database, admin, or executor ports.

## Stop

```bash
docker compose -f infra/docker-compose.yml down
```

Do not add `-v` unless intentionally deleting the local development database.
