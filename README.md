# VC Policy Engine

Open-core TypeScript engine that turns a verifiable presentation into a
deterministic **PASS / FAIL / REVIEW** decision. Licensed under [Apache-2.0](LICENSE).
Contributions require a [DCO sign-off](CONTRIBUTING.md).

## Packages

| Package | Role |
| --- | --- |
| `@vc-policy-engine/core` | Domain types, typed errors, ports (crypto, keys, trust, status, storage, clock) |
| `@vc-policy-engine/dummy` | CI-only package used to prove test-registry publish and provenance |
| `@vc-policy-engine/app` | Placeholder application workspace |

## Requirements

- Node.js 22+
- pnpm 9.15.4+ (`corepack enable`)

## Commands

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Design

Ports live in core. Adapters (HTTP, PostgreSQL, jose, KMS) must not be imported
from core. Policy evaluation accepts **verified claims** only, never raw
presentation or credential bytes.

See [ROADMAP.md](ROADMAP.md), [docs/adr](docs/adr/README.md), and the documents
in `docs/`.
