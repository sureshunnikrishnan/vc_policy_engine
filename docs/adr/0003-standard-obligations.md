# ADR-0003: Standard obligation set

- Status: Accepted
- Date: 2026-11-07

## Context

An allow decision may carry **obligations** — actions the PEP / consumer must perform if it honors the decision (audit log, step-up authentication, and similar). The policy model can treat `type` as either:

- a **closed, versioned set** of obligation types, or
- **free-form strings** plus opaque `params`.

Free-form types are easy to extend per deployment but make evidence, PEP contracts, and interoperability weakly defined. A standard set is smaller and maps cleanly onto wallets, gateways, and audit tooling.

## Decision

**Obligations use a standard, versioned type set**, not arbitrary strings. Unknown types are a policy validation error (`POLICY_INVALID`).

Initial set:

| Type | Meaning |
|------|---------|
| `log_access` | Persist an access/audit record (typically from decision evidence). |
| `step_up_auth` | Require additional authentication before completing the action. |

`Obligation.params` may carry type-specific fields (e.g. `acr` for `step_up_auth`, `sink` for `log_access`) but must not invent a new `type`. New types are added by a policy schema / evidence `schemaVersion` bump, documented in a follow-on ADR or changelog.

## Consequences

- Policy authors and PEPs share a fixed vocabulary.
- Golden tests can assert obligation types without stringly-typed matching.
- Deployments that need a custom obligation wait for a schema extension rather than stuffing meaning into free-form types.
- `Decision.obligations` is always a subset of this enum when `effect` is `allow` (and only then, unless a future ADR says otherwise).

## Alternatives considered

- **Free-form `type: string`** — fastest for experiments; poor interoperability and evidence stability.
- **XACML-style open catalog** — too large for MVP; can be layered later as additional enum members.
