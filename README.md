# vc-policy-engine

Bun + TypeScript monorepo. **M0 complete** (scaffold). Next: [M1 offline evaluator](docs/implementation-guide.md#m1-offline-evaluator).

## Docs

- [Architecture](docs/architecture.md)
- [Implementation guide](docs/implementation-guide.md) (M0–M5)
- [ADRs](docs/adr/README.md)

## Packages

- `@vc-policy-engine/core` — shared library
- `@vc-policy-engine/app` — runnable app that depends on `core`

## Commands

```bash
bun install
bun run start
bun test
bun run typecheck
```

Run a script in one workspace:

```bash
bun run --filter @vc-policy-engine/core test
```
