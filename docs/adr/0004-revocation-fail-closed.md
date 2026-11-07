# ADR-0004: Fail closed (`deny`) on revocation fetch failure

- Status: Accepted
- Date: 2026-11-07

## Context

When a credential has a status reference and the policy requires it to be unrevoked (`requireUnrevoked !== false`), the engine must consult a `RevocationProvider`. That call can fail: missing provider, network error, malformed status list, or `unknown` status.

Two outcomes are possible:

- **`deny`** (fail closed) — cannot prove the credential is active, so the requirement fails.
- **`indeterminate`** — distinguish “we could not tell” from a positive deny, for callers that want a retry or a human review.

Regulated and high-assurance deployments typically refuse access unless revocation status is confirmed. The architecture already described fail-closed as the default and a lenient mode for other environments.

## Decision

**The default is fail closed: revocation fetch failure yields `deny`**, not `indeterminate`. This is the correct default for regulated sectors and is the library default (`strictRevocation: true`).

`indeterminate` remains available when `strictRevocation: false` (lenient deployments). Evidence always records the revocation phase (`unknown` / error reason codes) so either mode is auditable.

## Consequences

- Missing `RevocationProvider` + status present + `requireUnrevoked` → `deny` with an explicit evidence step (e.g. `REVOCATION_STATUS_UNKNOWN`).
- Integrators serving regulated workloads get safe behavior without extra config.
- Lenient mode is opt-in and must be a conscious `PolicyEngineConfig` choice.
- Callers must not treat `deny` as “definitely revoked”; they should read evidence reason codes if they need to distinguish revoked vs. fetch failure.

## Alternatives considered

- **`indeterminate` as default** — clearer retry semantics, easier to misconfigure in production as “soft allow” if the PEP maps unknown → 200.
- **Always deny, no lenient flag** — simpler, but blocks air-gapped tests and deployments that accept stale status.
