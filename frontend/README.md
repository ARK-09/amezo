# frontend

Vite + React + TypeScript. See `src/features/*` for feature code, `src/pages`
for routed pages, `src/components/ui` for shadcn primitives.

## Commands

```bash
pnpm dev          # dev server, proxied at https://marketplace-frontend.localhost (portless)
pnpm build        # typecheck + production build
pnpm test         # vitest (unit/component, MSW-mocked)
pnpm e2e          # playwright (spins up its own dev server)
pnpm lint         # oxlint
pnpm gen:api      # regenerate src/lib/api/schema.d.ts from an OpenAPI spec
```

## API types

`schema.d.ts` is generated, not hand-written, and gitignored. Right now
`gen:api` points at `openapi/fixture.yaml` — a placeholder spec with one
`/health` endpoint, since the Spring backend doesn't exist yet and can't emit
a real one. Once it does (springdoc adds `/v3/api-docs`), swap the `gen:api`
script in `package.json` to run against that URL instead, delete
`openapi/fixture.yaml`, and re-run it.

Run `pnpm gen:api` once after cloning, before `pnpm dev`/`pnpm build`.
