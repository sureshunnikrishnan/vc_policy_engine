# ADR-0005: Signed policy documents (JWS)

- Status: Accepted
- Date: 2026-11-07

## Context

Policies are versioned JSON documents that fully determine allow/deny. If a policy can be swapped or edited in transit, evaluation evidence is not trustworthy. Unsigned JSON is fine for local tests; production distribution needs integrity and authenticity.

The open question was whether **signed policy documents (JWS)** belong in **M3** (alongside evidence schema and golden tests) or later.

## Decision

**Signed policy documents are in scope.** The engine accepts a policy as either:

- an unsigned `PolicyDocument` (dev, fixtures, already-trusted in-process objects), or
- a **JWS** (compact or JSON serialization) whose payload is a `PolicyDocument`.

When the input is JWS, the engine verifies the signature against a configured policy-signer trust set before parse/validate. Verification failure is `POLICY_INVALID` (or a dedicated `POLICY_SIGNATURE_INVALID` code) and does not produce an allow decision.

M3 includes: evidence schema, reason codes, golden tests, **and** JWS policy verification (digest in `DecisionEvidence.bindings.policyDigest` covers the canonical policy payload).

## Consequences

- Policy distribution can be a signed artifact (file, HTTP, wallet config) without a separate policy server in the library.
- Unsigned policies remain valid for unit tests and for callers that verified the document themselves.
- Key management for policy signers is configuration (`PolicyEngineConfig`), not a global issuer registry.
- M3 grows relative to “evidence only”; JWT VC adapter stays on M4 ([ADR-0001](0001-jwt-vc-first.md)).

## Alternatives considered

- **Unsigned policies only** — smaller M3; integrity left entirely to the host.
- **Defer JWS to a later milestone** — evidence bindings without payload authenticity are weaker for dispute resolution.
- **Sign policies as VCs** — possible later; JWS on the JSON document is enough for M3 and matches JWT-first tooling.
