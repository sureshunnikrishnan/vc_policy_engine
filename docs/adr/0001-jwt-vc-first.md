# ADR-0001: JWT VC first for MVP

- Status: Accepted
- Date: 2026-11-07

## Context

The engine must normalize wire-format credentials into an internal `CredentialView` before policy evaluation. Three formats are in scope over the life of the product:

- **JWT VC** (`vc+jwt` / W3C VC-JWT)
- **SD-JWT VC** (selective disclosure)
- **JSON-LD VC** (linked-data proofs)

Supporting all three in the first evaluator would delay a working pipeline and split adapter effort. The architecture already treats formats as pluggable; the question is which adapter ships first.

## Decision

**JWT VC is the canonical MVP format.** M1–M4 implement parse, normalize, and optional verify for JWT VCs. SD-JWT VC and JSON-LD remain on the adapter roadmap (`@vc-policy-engine/adapters-jwt` first; JSON-LD and SD-JWT packages later) and do not block core policy evaluation.

Internal types already include `format: "jwt_vc" | "sd_jwt_vc" | "json_ld" | "unknown"` so later adapters do not force a model change.

## Consequences

- Fixtures, golden tests, and the `app` harness use JWT VC samples.
- Crypto verification for MVP is JWT (JWS) via the injected `CredentialVerifier`.
- Policies may constrain `credentialTypes` without encoding a wire format; format is an adapter concern.
- SD-JWT disclosure handling and JSON-LD canonicalization are explicitly out of MVP.

## Alternatives considered

- **SD-JWT first** — stronger privacy story, but disclosure reconstruction complicates `CredentialView` and evidence before the evaluator is proven.
- **JSON-LD first** — common in some trust frameworks, but proof suites and canonicalization are heavier than JWT for an embeddable TS library.
- **All three in MVP** — rejected as scope.
