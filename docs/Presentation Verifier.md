# Presentation Verifier — Implementation Plan

**Purpose:** Build the **presentation protocol layer** first: OpenID4VP 1.0 + HAIP 1.0 request construction, wallet response handling (`direct_post.jwt`), and the **`presentation` gate**—before credential format verification, trust, status, or policy.

**Baseline:** [Design & Architecture Document](./VC%20Policy%20Engine%20—%20Design%20&%20Architecture%20Document.pdf) (v1.0) · [Implementation Plan](./VC%20Policy%20Engine%20—%20Implementation%20Plan.pdf) (steps **0.5–0.6**, **1.1**, **1.4**, partial **1.11**)

**Primary deliverable:** `@vc-policy-engine/openid4vp` (+ minimal `crypto` and `storage` adapters to support it).

**Explicitly not in this plan (later phases):** SD-JWT VC / mdoc cryptographic verification (`format-*`), EU LoTL (`trust-eu-lotl`), status lists, policy/CEL, tenant REST API, Redis/Postgres in production shape.

---

## What “presentation verifier” means here

| In scope | Out of scope (v1.0) |
|----------|---------------------|
| Signed **JAR** authorization request (`x509_hash` client id) | DIF Presentation Exchange |
| **DCQL** query attached to the request | SIOPv2-only flows |
| **`direct_post.jwt`** decryption (ECDH-ES) | Custom deeplink schemes |
| **nonce**, **state**, **audience**, expiry, **replay** rejection | Full multi-tenant intermediary API (P2) |
| Emit **untrusted** credential bytes (`RawCredential`) for downstream format verifiers | Producing PASS/FAIL policy decisions |

**Done when (this plan):** You can run a local flow: create session → signed HAIP request → accept wallet response → pass **presentation gate** or return typed `presentation.*` errors → output structured credential payloads without verifying issuer signatures yet. **Stretch:** OIDF OpenID4VP + HAIP verifier tests pass locally (Implementation Plan step **1.4**).

---

## Prerequisites

Before **Step 1**, ensure:

- [ ] Node.js **22+** and **pnpm 9.15.4+** (`corepack enable`)
- [ ] Design partner or lab **sandbox access certificate** (or self-signed HAIP test material) — needed from **Step 12** onward for realistic JAR signing
- [ ] Read ADR intent: wrap **OWF** `openid4vc-ts`, `dcql-ts` (ADR-002); do not fork protocol logic in `core`
- [ ] Optional: clone [OIDF OpenID4VP verifier tests](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html) / HAIP conformance material for **Step 20**

---

## Package map (target end state)

| Package | Role for presentation verifier |
|---------|--------------------------------|
| `@vc-policy-engine/core` | `RawPresentation`, `RawCredential`, `presentation` gate, `EngineError` codes, ports |
| `@vc-policy-engine/crypto` | JOSE sign/verify, JWE decrypt, algorithm allow-list |
| `@vc-policy-engine/crypto-node` | Node/Web Crypto adapter implementing `CryptoPort` |
| `@vc-policy-engine/openid4vp` | JAR + DCQL request builder, response parser, presentation gate |
| `@vc-policy-engine/testing` | Vectors, golden files, wallet/verifier stubs (optional but recommended) |

---

## How to use this document

1. Execute **one step at a time** in order (steps may be split across PRs).
2. Do not tick **Done when** until the evidence listed exists (tests green, ADR note, or linked PR).
3. Each step lists **Depends on** — do not skip upstream steps.
4. After each step: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

---

## Step 1 — Confirm repository baseline

**Depends on:** Prerequisites

**Goal:** Monorepo builds; `core` exposes presentation types and gate order without importing frameworks.

**Actions:**

1. Verify workspace layout: `packages/core`, `packages/app`, root `pnpm-workspace.yaml`.
2. Confirm `EVALUATION_GATES` starts with `"presentation"`.
3. Confirm `EngineError` includes `presentation.replay`, `presentation.expired`, `presentation.nonce_mismatch`, `presentation.audience_mismatch`, `presentation.malformed`.
4. Confirm `RawPresentation` / `asRawPresentation()` cannot flow to policy types (boundary test).

**Done when:**

- [ ] `pnpm test` passes including package-boundary tests for `core`
- [ ] No `fastify`, `pg`, or `react` imports inside `packages/core`

---

## Step 2 — Extend `StoragePort` for presentation sessions (core)

**Depends on:** Step 1

**Goal:** Core defines how nonce/state are stored without binding to Redis.

**Actions:**

1. Document session record shape in core types (e.g. `PresentationSession`: `sessionId`, `nonce`, `state`, `audience`, `expiresAt`, `policyVersionRef`, `status`).
2. Extend `StoragePort` with atomic operations: `putSession`, `getSession`, `consumeNonce` (single-use), optional `deleteSession`.
3. Add `presentation` gate interface type: input `RawPresentation` + session id; output either `continue` with extracted credential envelopes or `verification-error`.

**Done when:**

- [ ] In-memory fake implements `StoragePort` in tests
- [ ] `consumeNonce` second call fails with `presentation.replay` in a unit test

---

## Step 3 — Scaffold `@vc-policy-engine/crypto` (minimal)

**Depends on:** Step 1

**Goal:** Port-level crypto operations needed for JAR and `direct_post.jwt` (not full X.509 path validation yet).

**Actions:**

1. Create `packages/crypto` depending only on `core`.
2. Implement against `CryptoPort`: `signJwt`, `verifyJwt`, `decryptJwt` (ECDH-ES + A256GCM), algorithm allow-list (`ES256`, `ES384`, `ES512`, `EdDSA`).
3. Reject disallowed algs with `crypto.algorithm_not_allowed`.

**Done when:**

- [ ] Round-trip sign/verify test for ES256 JWS
- [ ] Round-trip encrypt/decrypt test for ECDH-ES direct content encryption used by HAIP responses

**Note:** Full certificate path validation stays in Step 4; presentation response decryption may use ephemeral wallet keys without chain validation at this gate.

---

## Step 4 — Scaffold `@vc-policy-engine/crypto-node`

**Depends on:** Step 3

**Goal:** Default Node 22 adapter (Web Crypto + `jose` per ADR spikes).

**Actions:**

1. Create `packages/crypto-node` implementing `CryptoPort` using `jose` (and `@peculiar/x509` only where needed later).
2. Wire `KeyProviderPort` dev adapter: PEM files or PKCS#11 stub for local demos.

**Done when:**

- [ ] `crypto-node` passes the same tests as Step 3 via adapter import
- [ ] ADR-002 spike notes recorded (library versions, limitations)

---

## Step 5 — Create `@vc-policy-engine/openid4vp` package shell

**Depends on:** Steps 2–4

**Goal:** Empty package with strict dependency rule: imports `core`, `crypto`; never imports `format-*`, `trust`, `policy`.

**Actions:**

1. Add `packages/openid4vp/package.json`, `tsconfig.json`, export map.
2. Add package-boundary test: forbidden imports list.
3. Register in root `tsconfig` project references and CI.

**Done when:**

- [ ] Package builds and appears in workspace `pnpm build`

---

## Step 6 — Integrate OWF `dcql-ts` (DCQL builder)

**Depends on:** Step 5

**Goal:** Build DCQL from policy “required evidence” (start with a **fixed PID fixture** before policy compiler exists).

**Actions:**

1. Add dependency on `dcql-ts` (or OWF package name confirmed in ADR-002 spike).
2. Implement `createDcqlQueryFromEvidence(evidence: PolicyEvidenceRef): unknown` with a minimal PID profile: credential query id, `vct` / format hints, required claim paths.
3. Export `createPidDcqlQuery()` for demos (matches EU PID lab scenarios).

**Done when:**

- [ ] Snapshot test: DCQL JSON matches agreed partner test vector (from Implementation Plan step **0.9** when available)
- [ ] Invalid evidence yields `policy.invalid` or a dedicated validation error before request signing

---

## Step 7 — Integrate OWF `openid4vc-ts` (request object)

**Depends on:** Steps 4, 6

**Goal:** Produce a HAIP-conformant authorization request.

**Actions:**

1. Add `openid4vc-ts` wrapper behind `createOpenId4VpRequest()`.
2. Inputs: `CryptoPort`, `KeyProviderPort`, verifier key ref, `client_id` (`x509_hash`), `response_uri`, `nonce`, `state`, DCQL.
3. Set HAIP fields: `client_id_scheme`, `response_mode: direct_post.jwt`, encryption key for response, `nonce`, `state`, expiry.
4. Sign as **JAR** (JWT-serialized request object) with access-certificate key.

**Done when:**

- [ ] Generated request validates against OWF library’s own verifier/parser
- [ ] Changing `nonce` changes request payload deterministically

---

## Step 8 — Verifier identity (`x509_hash` client id)

**Depends on:** Step 7

**Goal:** HAIP client identification toward wallets.

**Actions:**

1. Implement helper: build `client_id` from access certificate hash per HAIP 1.0.
2. Support optional `x509_san_dns` client id path for legacy wallet interop (feature flag).
3. Unit test with sandbox cert from Step 12 prerequisites.

**Done when:**

- [ ] `client_id` matches HAIP test vector for a known sample certificate
- [ ] Documented in package README how to rotate access certificate

---

## Step 9 — Session lifecycle (create + pin)

**Depends on:** Steps 2, 7

**Goal:** Orchestration slice for “start presentation session” without full REST API.

**Actions:**

1. Implement `startPresentationSession(input)`: generate `nonce`, `state`, expiry; persist via `StoragePort`; pin policy/evidence version id; return session id + authorization request string/URL.
2. Session states: `AWAITING_PRESENTATION`, `REJECTED`, `EXPIRED` (align with design doc API names for future Fastify layer).

**Done when:**

- [ ] Integration test: two sessions have distinct nonces
- [ ] Expired session rejects processing with `presentation.expired`

---

## Step 10 — Response receiver (`direct_post.jwt`)

**Depends on:** Steps 4, 9

**Goal:** Accept wallet POST body and decrypt.

**Actions:**

1. Implement `receiveDirectPostJwt(sessionId, body, ports)`.
2. Decrypt JWE using response encryption private key from `KeyProviderPort`.
3. Parse inner JWT; extract `vp_token` / credential containers per OpenID4VP 1.0.
4. Wrap ciphertext bytes as `RawPresentation` or an internal envelope type before gate logic.

**Done when:**

- [ ] Golden test with a fixture `direct_post.jwt` from OWF examples or EU lab decrypts successfully
- [ ] Tampered ciphertext fails with `presentation.malformed` or `crypto.signature_invalid` (never silent pass)

---

## Step 11 — Presentation gate (correlation checks)

**Depends on:** Steps 9, 10

**Goal:** Full **presentation gate** from the design doc decision flow step 4.

**Actions:**

1. Implement `verifyPresentationGate(session, decryptedResponse)`:
   - Match **state** to session
   - Match **nonce** to session; call `consumeNonce`
   - Match **audience** to verifier `client_id` / configured audience
   - Reject expired sessions
2. Map failures to `EngineError` with gate `presentation` and stable `code`.
3. On success, return `GateResult` kind `continue` plus parsed credential byte blobs per format hint.

**Done when:**

- [ ] Negative matrix (minimum):

  | Case | Expected code |
  |------|----------------|
  | Reused nonce | `presentation.replay` |
  | Wrong state | `presentation.nonce_mismatch` or dedicated state error |
  | Wrong aud | `presentation.audience_mismatch` |
  | Expired session | `presentation.expired` |
  | Malformed JWT | `presentation.malformed` |

- [ ] Success path never exposes data to policy types—only `RawCredential[]`

---

## Step 12 — `transaction_data` (optional HAIP)

**Depends on:** Step 7

**Goal:** Support HAIP transaction binding when policy requires it.

**Actions:**

1. Add optional `transaction_data` array to request builder from policy metadata.
2. Verify response includes matching transaction hashes when requested.
3. Fail closed if required transaction data is missing.

**Done when:**

- [ ] Feature-flagged test passes with OIDF/HAIP fixture that includes `transaction_data`
- [ ] Disabled flag preserves previous behavior (no regression)

---

## Step 13 — Extract credentials for downstream verifiers

**Depends on:** Step 11

**Goal:** Normalize VP payload into `RawCredential` per format (`dc+sd-jwt`, `vc+sd-jwt`, `mso_mdoc`).

**Actions:**

1. Map `vp_token` entries to `asRawCredential(format, bytes)`.
2. Do **not** verify issuer signatures here—that is the **credential** gate (`format-sd-jwt-vc`, `format-mdoc` in a later plan).
3. Attach holder-binding material references (KB-JWT, session transcript handles) as opaque metadata on the envelope for Step 1.2/1.3 later.

**Done when:**

- [ ] Mixed-format VP (if fixture exists) yields correct format labels
- [ ] TypeScript prevents passing `RawCredential` to `PolicyEvaluationInput`

---

## Step 14 — Public API surface

**Depends on:** Steps 9–13

**Goal:** Single facade for integrators and future SDK.

**Actions:**

1. Export from `openid4vp`:
   - `startPresentationSession`
   - `receiveDirectPostJwt`
   - `verifyPresentationGate`
   - `createOpenId4VpRequest` (lower level)
2. Document inputs/outputs; no claim values in error messages or logs.

**Done when:**

- [ ] `packages/openid4vp/README.md` describes the flow in 10 lines + link to this plan
- [ ] All exports have explicit return types (strict TS)

---

## Step 15 — In-memory demo CLI

**Depends on:** Step 14

**Goal:** Laptop demo without wallet (Implementation Plan **1.11** precursor).

**Actions:**

1. Add `apps/demo-verifier` or extend `packages/app` with a CLI:
   - `create-request` → prints QR payload or `request_uri`
   - `accept-response` → reads `direct_post.jwt` file, runs gate
2. Use in-memory `StoragePort` and file-based dev keys.

**Done when:**

- [ ] `pnpm demo:presentation` (script name your choice) runs request + stub response round-trip
- [ ] README quickstart updated

---

## Step 16 — Stub wallet for automated E2E

**Depends on:** Steps 14–15

**Goal:** CI-friendly fake wallet that posts a valid response for a given request.

**Actions:**

1. In `packages/testing`, implement stub that echoes request `nonce`/`state` and returns pre-recorded VP token bytes (no real issuer crypto).
2. E2E test: session → request → stub wallet response → presentation gate **continue**.

**Done when:**

- [ ] E2E runs in GitHub Actions without network or HSM

---

## Step 17 — Sandbox certificate integration

**Depends on:** Steps 8, 15

**Goal:** Move from pure fixtures to QTSP/intermediary sandbox access certificate.

**Actions:**

1. Load access cert + key via `KeyProviderPort` from env or volume (never commit secrets).
2. Re-run Step 8 client id tests with real material.
3. Optional: manual test with EU reference wallet or national sandbox.

**Done when:**

- [ ] Documented env vars for cert paths
- [ ] One manual run log (redacted) attached to internal wiki or PR

---

## Step 18 — OIDF OpenID4VP verifier tests (local)

**Depends on:** Steps 14, 17

**Goal:** Implementation Plan step **1.4** exit criterion.

**Actions:**

1. Add script to clone/vendor OIDF verifier test suite (pin version).
2. Wire your request/response handlers into the suite’s harness.
3. Fix failures until green locally.

**Done when:**

- [ ] OIDF OpenID4VP 1.0 + HAIP verifier tests pass on developer machine
- [ ] List of any waived tests documented with reason + issue link

---

## Step 19 — CI conformance job

**Depends on:** Step 18

**Goal:** Implementation Plan step **1.13** precursor (presentation-only job).

**Actions:**

1. GitHub Actions job: `pnpm test` + OIDF suite on schedule or main-only (runtime budget).
2. Cache conformance vectors; fail build on regression.

**Done when:**

- [ ] Green on `main` for presentation conformance workflow

---

## Step 20 — Threat-model checklist (presentation boundaries)

**Depends on:** Step 11

**Goal:** Design doc trust boundaries **2** and **3** (engine ↔ wallet; untrusted bytes).

**Actions:**

1. Review controls: replay, encryption, parser limits (max JWT size, max credentials count).
2. Add fuzz smoke test or size-limit tests for `direct_post.jwt`.
3. Log findings in SECURITY.md or threat-model appendix.

**Done when:**

- [ ] Checklist signed off; critical findings filed as issues

---

## Step 21 — Handoff to credential verifier plan

**Depends on:** Steps 11, 13, 18

**Goal:** Freeze presentation API and start **format-sd-jwt-vc** / **format-mdoc** work.

**Actions:**

1. Tag release `0.1.0-preview presentation` (changeset).
2. Open follow-on doc: *Credential Verifier Implementation Plan* consuming `RawCredential[]`.
3. Ensure orchestration in `core` wires `presentation` → `credential` gate without skipping.

**Done when:**

- [ ] Published preview package `@vc-policy-engine/openid4vp` to registry (or verdaccio in CI)
- [ ] ADR-002 marked **Accepted** with final library versions

---

## Suggested PR sequence (summary)

| PR | Steps | Theme |
|----|-------|--------|
| 1 | 1–2 | Core session port + presentation types |
| 2 | 3–4 | Crypto ports + Node adapter |
| 3 | 5–8 | openid4vp request + HAIP client id |
| 4 | 9–11 | Session + response + presentation gate |
| 5 | 12–14 | transaction_data + RawCredential extract + API |
| 6 | 15–16 | Demo CLI + stub wallet E2E |
| 7 | 17–19 | Sandbox certs + OIDF conformance + CI |
| 8 | 20–21 | Threat review + release handoff |

---

## References

- Design doc § Decision flow (steps 1–4), § Packages (`openid4vp`), § Formats matrix (Presentation protocol)
- Implementation Plan P0 **0.5–0.6**, P1 **1.1**, **1.4**, **1.11**, **1.13**
- Core gate order: `presentation` → `credential` → `trust` → `status` → `policy`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-11-09 | Initial plan: presentation-first vertical slice |
