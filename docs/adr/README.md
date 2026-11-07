# Architecture Decision Records

ADRs record decisions that shape the VC Policy Engine. Numbered files are immutable once accepted; superseding a decision means a new ADR that points at the old one.

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-jwt-vc-first.md) | JWT VC first for MVP | Accepted |
| [0002](0002-w3c-vp-wrapper.md) | Require a W3C Verifiable Presentation wrapper | Accepted |
| [0003](0003-standard-obligations.md) | Standard obligation set | Accepted |
| [0004](0004-revocation-fail-closed.md) | Fail closed (`deny`) on revocation fetch failure | Accepted |
| [0005](0005-signed-policy-documents.md) | Signed policy documents (JWS) | Accepted |

Template (Nygard): Context → Decision → Consequences. Alternatives go in the same file when they were seriously considered.
