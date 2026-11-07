# VC Policy Engine — Implementation Guide

Step-by-step build plan for the milestones in [`architecture.md`](architecture.md) §17. Normative design stays in the architecture and [`docs/adr/`](adr/README.md); this guide is the work sequence.

**Current state:** M0 complete. `@vc-policy-engine/core` still exports `greet()` until M1 ships `createPolicyEngine`.

| Milestone | Outcome | Depends on |
|-----------|---------|------------|
| [M0](#m0-scaffold-done) | Monorepo compiles and tests | — |
| [M1](#m1-offline-evaluator) | Offline `evaluate()` on a W3C VP | M0 |
| [M2](#m2-revocation) | Revocation + fail-closed default | M1 |
| [M3](#m3-evidence-and-signed-policies) | Evidence, reason codes, policy JWS | M1–M2 |
| [M4](#m4-jwt-vc-and-vp) | JWT VC / JWT VP adapter + verifier hook | M1, M3 fixtures |
| [M5](#m5-cel-prototype) | CEL backend behind a flag | M1 evaluator |

Do **not** start M4 crypto or M5 CEL until M1’s requirement engine is covered by tests. Later milestones plug into the same pipeline.

---

## Conventions

- **Package:** all engine code in `packages/core` until a JWT adapter split is justified (architecture §5.2).
- **Public API:** `createPolicyEngine(config).evaluate(input)` only. No credential-array overload ([ADR-0002](adr/0002-w3c-vp-wrapper.md)).
- **MVP format:** JWT VC inside a W3C VP ([ADR-0001](adr/0001-jwt-vc-first.md)). M1 may accept an **unsigned JSON VP** whose `verifiableCredential` entries are JSON objects; M4 replaces that with JWT.
- **Fail closed:** `strictRevocation` defaults to `true` ([ADR-0004](adr/0004-revocation-fail-closed.md)).
- **Obligations:** `log_access` \| `step_up_auth` only ([ADR-0003](adr/0003-standard-obligations.md)).
- **Tests:** `bun test` in `packages/core`. Fixtures under `packages/core/tests/fixtures/`.
- **Definition of done** for a milestone: types compile, listed tests pass, `app` can call the new API, architecture sketch types match exports.

Suggested `packages/core/src/` layout (grow it as you hit each phase):

```text
index.ts                 # public exports only
types/                   # PolicyDocument, CredentialView, Decision, errors
policy/                  # parse + validate (+ JWS in M3)
claims/                  # ClaimPredicate ops
trust/                   # IssuerRegistry, TrustPolicy
revocation/              # RevocationProvider (M2)
adapters/                # VP → CredentialView[]
evaluator/               # pipeline + requirement groups
evidence/                # DecisionEvidence (M3)
```

---

## M0 — Scaffold (done)

**Goal:** Bun + TypeScript workspaces; `core` consumed by `app`.

Executed 2026-11-07.

### In place

1. Root workspace (`packages/*`), `bun install`, `bun test`, `bun run typecheck`.
2. `@vc-policy-engine/core` (`greet` placeholder) and `@vc-policy-engine/app`.
3. Architecture + ADRs 0001–0005.
4. `README.md` links this guide and `docs/architecture.md`.
5. Root `tsconfig.json` excludes `node_modules` / `dist`.

`greet` stays until M1 exports `createPolicyEngine`; then delete it and its tests so the public surface is the engine only.

**Exit (verified):** `bun test` (2 pass), `bun run typecheck`, `bun run start` (`Hello, vc-policy-engine`).

---

## M1 — Offline evaluator

**Goal:** Given an unsigned `PolicyDocument`, a W3C VP (JSON), and `EvaluationContext`, return `allow` / `deny` with no network I/O.

Skip crypto, revocation fetch, evidence schema polish, and JWT. Use a **Noop** revocation provider that treats missing `status` as active and present `status` as `unknown` (which will deny under default strict mode — so M1 fixtures should omit `status` unless you are testing that path).

### Steps

1. **Types** (`packages/core/src/types/`)
   - Port architecture §6: `EvaluationContext`, `CredentialView`, `IssuerRef`, `PolicyDocument`, `RequirementGroup`, `Requirement`, `ClaimPredicate`, `Obligation` / `ObligationType`, `Decision`, `EvaluationInput` / `EvaluationResult`.
   - Stub `DecisionEvidence` with `steps: []` if you do not want a second shape in M3.
   - `PolicyEngineError` with `POLICY_INVALID` | `PRESENTATION_INVALID` | `INTERNAL`.

2. **Policy parse / validate**
   - Accept `PolicyDocument` or JSON string (not JWS yet).
   - Reject unknown `Obligation.type`, empty `requirementGroups`, bad `effect`.
   - Default `requireUnrevoked` to `true` when a credential later has `status`.

3. **Claim predicates**
   - Implement `eq`, `in`, `exists`, `match` on a dotted path (pick dotted path as canonical for v1; document it).
   - Unit tests for missing path, type mismatch, nested objects.

4. **JSON VP stub adapter** (not a public credential-array API)
   - Input: W3C VP JSON (`type` includes `VerifiablePresentation`, `verifiableCredential` array).
   - Map each embedded credential to `CredentialView` (`format: "unknown"` or `"json_ld"` until M4).
   - Reject a top-level array with `PRESENTATION_INVALID`.
   - Internal test helper may build a VP around fixture VCs; production callers still pass a VP.

5. **Trust**
   - `InMemoryIssuerRegistry` (map of issuer id → metadata).
   - `AllowlistTrustPolicy` using `policy.issuerConstraints` (and optional global allowlist on config).
   - Untrusted issuer → that credential cannot satisfy a requirement; record a fail (full evidence in M3).

6. **Requirement evaluator**
   - Groups **AND**; `anyOf` inside a group **OR**.
   - Match `credentialTypes`, issuer allow/deny, claims, `maxAge` vs `context.now` / `issuedAt`.
   - Policy `effect: "allow"` if all groups pass; else `deny`. Attach `obligations` only on `allow`.
   - `failFast` optional: stop at first failed group.

7. **Engine factory**
   - `createPolicyEngine({ issuerRegistry, trustPolicy, revocationProvider, strictRevocation?: true })`.
   - Pipeline: parse policy → normalize VP → trust → revocation noop → match groups → `Decision`.
   - Default `strictRevocation: true`.

8. **`app` harness**
   - Load one fixture policy + VP, print `decision.effect`.
   - Replace `greet` usage.

### Tests

| Case | Expected |
|------|----------|
| Types + issuer + claims match | `allow` + obligations if listed |
| One group unsatisfied | `deny` |
| Untrusted issuer | `deny` |
| Bare credential array | throw `PRESENTATION_INVALID` |
| Unknown obligation type | throw `POLICY_INVALID` |
| `maxAge` exceeded | `deny` |

**Exit:** `createPolicyEngine` is the public export; JWT and HTTP are still absent.

---

## M2 — Revocation

**Goal:** Status-aware evaluation; fail closed on fetch failure ([ADR-0004](adr/0004-revocation-fail-closed.md)).

### Steps

1. **`RevocationProvider` interface** — `checkBatch(refs) → Map<id, RevocationStatus>` (`active` / `revoked` / `suspended` / `unknown`).
2. **`NoopRevocationProvider`** — no `status` → treat as active; `status` present → `unknown`.
3. **In-memory / fake provider** for tests (preloaded bitstring or map of index → state). Do not implement HTTP `StatusList2021Fetcher` until a consumer needs it; keep the interface ready.
4. **`CachedRevocationProvider`** decorator — TTL keyed by `(statusListCredential, index)`; batch by list URL.
5. **Requirement interaction**
   - `requireUnrevoked !== false` and `status` present → credential usable only if status is `active`.
   - `unknown` / provider error / missing provider: `deny` if `strictRevocation` (default); `indeterminate` if `strictRevocation: false`.
6. Reason-code placeholders: `CREDENTIAL_REVOKED`, `REVOCATION_STATUS_UNKNOWN` (stabilize names in M3).

### Tests

| Case | Expected |
|------|----------|
| Active + requirements pass | `allow` |
| Revoked | `deny` |
| Fetch failure, strict (default) | `deny` |
| Fetch failure, `strictRevocation: false` | `indeterminate` |
| No `status` on credential | skip revocation; do not deny for that reason |

**Exit:** Default config is safe for regulated deployments; lenient mode is opt-in.

---

## M3 — Evidence and signed policies

**Goal:** Stable `DecisionEvidence` + golden tests + JWS policy verify ([ADR-0005](adr/0005-signed-policy-documents.md)).

### Steps

1. **Evidence schema `1.0`**
   - `DecisionEvidence` as in architecture §6.4: `steps`, `credentials` (digest-only by default), `trust`, `revocation`, `bindings`.
   - `contentBinding` / `policyDigest` / `contextDigest` (e.g. SHA-256 of canonical JSON).
   - Do not put `raw` credentials in evidence unless a debug flag is on.

2. **Stable reason codes** (enum, not free strings)

   `ISSUER_NOT_TRUSTED`, `CLAIM_MISMATCH`, `CREDENTIAL_REVOKED`, `REVOCATION_STATUS_UNKNOWN`, `REQUIREMENT_UNSATISFIED`, `CREDENTIAL_EXPIRED`, `PRESENTATION_INVALID` (as step vs throw — throws stay for parse errors).

3. **Pipeline steps** — every phase (`parse`, `trust`, `revocation`, `requirement`, `obligation`) appends `EvidenceStep` with `outcome` + `reasonCode`. Deterministic ordering for snapshots.

4. **Policy JWS**
   - If `policy` is a compact or flattened JWS, verify against `policySignerTrust` **before** JSON validate.
   - Failure or missing trust for a JWS input → `POLICY_SIGNATURE_INVALID` (do not evaluate).
   - Unsigned `PolicyDocument` objects skip verify (dev / in-process).
   - `bindings.policyDigest` hashes the **payload** `PolicyDocument`, not the JWS wrapper.

5. **Golden tests** under `packages/core/tests/fixtures/`

   ```text
   fixtures/
     policies/           # unsigned JSON + at least one signed JWS
     presentations/      # JSON VPs (JWT VPs in M4)
     expected/           # evidence snapshots
   ```

6. **Redaction hook** — optional `evidenceRedactor` on config.

### Tests

| Case | Expected |
|------|----------|
| Allow path snapshot | stable step order + reason codes |
| Deny untrusted issuer | `ISSUER_NOT_TRUSTED` on trust step |
| Valid policy JWS | evaluates; digest matches payload |
| Tampered / wrong-key JWS | `POLICY_SIGNATURE_INVALID` |
| Unsigned object | still evaluates |

**Exit:** Evidence JSON is snapshot-tested; signed policies work without JWT VCs.

---

## M4 — JWT VC and JWT VP

**Goal:** MVP wire format ([ADR-0001](adr/0001-jwt-vc-first.md), [ADR-0002](adr/0002-w3c-vp-wrapper.md)).

Keep the adapter in `core` (`adapters/jwt/`) until a second format appears; then split `@vc-policy-engine/adapters-jwt`.

### Steps

1. **JWT VP adapter**
   - Accept compact JWT VP (`typ` / `vp` claim) or JSON VP wrapping JWT VC strings.
   - Decode (and optionally verify) VP; extract `vp.verifiableCredential` JWT strings.

2. **JWT VC adapter**
   - Decode `vc` / W3C VC-JWT payload into `CredentialView` (`format: "jwt_vc"`).
   - Map `iss`, `nbf` / `iat`, `exp`, `vc.credentialSubject`, `vc.credentialStatus`.

3. **`CredentialVerifier` injection**
   - Optional. When set, verify VP proof and each VC JWS before trust.
   - Failure → throw `VERIFICATION_FAILED` or `deny` with evidence — pick **throw** for crypto failure (architecture §13) and document it.
   - When unset, decode only (M1-style), suitable for tests with unsigned JSON VPs still supported **or** drop JSON-object VCs; prefer keeping JSON VP only as a test fixture flag so production is JWT.

4. **Holder / challenge**
   - Record VP `holder` and `challenge` / `nonce` hash into evidence (replay binding).

5. **Fixtures** — real JWT VP + JWT VC samples (test keys). Golden tests from M3 re-run on JWT fixtures.

6. **`app`** — evaluate a JWT VP from disk.

### Tests

| Case | Expected |
|------|----------|
| Valid JWT VP + VCs, verifier on | `allow` / `deny` per policy |
| Bad VC signature, verifier on | `VERIFICATION_FAILED` |
| Verifier off, well-formed JWT | still normalizes to `CredentialView` |
| JSON VP without JWT (if still supported) | documented test-only path |

**Exit:** Integrators can pass an OID4VP-style JWT presentation. SD-JWT and JSON-LD stay future packages.

---

## M5 — CEL prototype

**Goal:** Feature-flagged CEL backend; v1 requirements remain the default.

### Steps

1. Add optional dependency / `@vc-policy-engine/cel` **or** an internal module behind `PolicyEngineConfig.expressionBackend: "rules" | "cel"`.
2. Compile v1 `Requirement` trees to CEL (read-only proof that both paths agree).
3. Allow `expression: string` on a requirement **or** policy for advanced cases; sandbox: no network, bounded cost, `context` / `credentials` / `now` only.
4. Evidence: store CEL subexpression results in `details` (redacted).
5. Keep JSON rules as the supported authoring format; CEL is opt-in.

### Tests

| Case | Expected |
|------|----------|
| Same policy, rules vs CEL | identical `effect` + comparable reason codes |
| CEL timeout / invalid expr | `deny` or `POLICY_INVALID`, never hang |
| Flag off | CEL code not executed |

**Exit:** Prototype only; do not make CEL the default authoring model.

---

## After M5 (not scheduled)

- HTTP `StatusList2021Fetcher`.
- SD-JWT and JSON-LD adapters.
- Compact policy DSL.
- Policy-as-VC (beyond JWS on JSON).
- Extra obligation types (schema bump + ADR).

---

## Suggested first PR slices

Ship M1 as more than one PR if needed:

1. Types + policy validate + claim predicates (no engine).
2. JSON VP stub + trust allowlist + `evaluate()` + tests.
3. `app` fixture run; remove `greet`.

Then M2, M3, M4, M5 as separate PRs.

---

## Document history

| Date | Change |
|------|--------|
| 2026-11-07 | M0 executed: tests, typecheck, and app start verified |
| 2026-11-07 | Initial guide from architecture milestones M0–M5 |
