# ADR-0002: Require a W3C Verifiable Presentation wrapper

- Status: Accepted
- Date: 2026-11-07

## Context

`evaluate()` needs a set of credentials plus holder/presentation binding. Two input shapes were on the table:

1. A **W3C Verifiable Presentation** (VP) wrapping one or more VCs (JWT VP or JSON VP).
2. A **bare array of credentials** (or pre-built `CredentialView[]`), leaving holder binding to the caller.

Bare arrays are convenient for unit tests and for callers that already verified a presentation. A VP wrapper is closer to OID4VP / W3C verifier practice and gives a single place for presentation proof, `holder`, `challenge` / `nonce`, and credential packing.

## Decision

**The public evaluation API requires a W3C Verifiable Presentation wrapper.** `EvaluationInput.presentation` is a VP (JWT VP containing JWT VCs for MVP, per [ADR-0001](0001-jwt-vc-first.md)). The engine does not accept a top-level credential array as a production input.

Normalization: VP → embedded VCs → `CredentialView[]`. Presentation-level fields (holder, challenge hash, VP proof outcome) are available to trust, requirements, and evidence.

Test fixtures still use VPs, even when the VP is unsigned or uses a test key. A `CredentialView[]` path may exist as an **internal** test helper, not as a supported public overload.

## Consequences

- Callers that only have loose VCs must wrap them in a VP before `evaluate()`.
- Replay / challenge binding can be recorded from the VP (`challenge` / `nonce`) into evidence.
- Holder-subject matching (delegated vs. self-presented) has a defined source: the VP holder.
- OID4VP-style verifiers map 1:1 onto the library input.

## Alternatives considered

- **Accept credential arrays** — simpler tests, weaker presentation semantics, easy to skip holder binding.
- **Dual public API (VP or array)** — more integrator convenience, two code paths and ambiguous evidence for “who presented.”
