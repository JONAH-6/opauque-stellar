# Formal Verification Scoping — Groth16 Verifier

> **Status:** Scoping document  
> **Date:** 2026-06-25  
> **Author:** DeborahOlaboye

## 1. Target

The `Groth16Verifier` Soroban contract at `contracts/groth16-verifier/src/lib.rs` implements on-chain Groth16 proof verification over BN254 (alt_bn128). It exposes two entry points:

- `verify_proof(proof_a, proof_b, proof_c, pub_signals)` — V1 circuit (5 public signals)
- `verify_proof_v2(proof_a, proof_b, proof_c, public_inputs)` — V2 circuit (4 public signals)

The contract uses Stellar's native BN254 host functions (`bn254.g1_add`, `bn254.g1_mul`, `bn254.pairing_check`) for the elliptic curve operations.

---

## 2. In-Scope Properties

### P1: Scalar Field Validity (HIGH)
**Description:** All 32-byte public signal values must be valid BN254 scalar field elements (strictly less than `r = 21888242871839275222246405745257275088548364400416034343698204186575808495617`).

**Verification approach:** The existing `is_valid_scalar` function performs a byte-wise comparison against `SCALAR_FIELD`. Formal verification would prove:
- `∀ val: [0; 32], is_valid_scalar(val) ⇒ val < r`
- `∀ val: [0; 32], ¬is_valid_scalar(val) ⇒ val ≥ r`
- The function is total (no panics).

**Feasibility on Soroban host:** High — pure arithmetic, no host calls.

### P2: Pairing Check Correctness (HIGH)
**Description:** The `run_pairing_check` function constructs a 768-byte pairing input from the proof components (negated `proof_a`, `proof_b`, `vk_alpha`, `vk_beta`, `vk_x`, `vk_gamma`, `proof_c`, `vk_delta`) and invokes `alt_bn128_pairing`.

**Verification approach:** Formal verification would prove:
- The pairing input layout matches the EIP-197 spec.
- `proof_a` is correctly negated in G1 (`neg_a = -proof_a`).
- `pairing_check` returns `true` iff `e(π_A, π_B) = e(vk_α, vk_β) * e(vk_x, vk_γ) * e(π_C, vk_δ)`.

**Feasibility on Soroban host:** Medium — the host function is a black box. We can verify the input encoding and output propagation, but the host pairing operation itself is trusted.

### P3: Linear Combination of Verification Key (HIGH)
**Description:** The V1 and V2 `verify_proof*` functions compute `vk_x = IC[0] + Σ(signal_i × IC[i+1])` using `alt_bn128_g1_mul` and `alt_bn128_g1_add`.

**Verification approach:** Formal verification would prove:
- `vk_x` is correctly computed from the public signals and VK points.
- The loop iteration count matches the expected signal count (5 for V1, 4 for V2).
- G1 addition and multiplication correctly use the host functions.

**Feasibility on Soroban host:** High — loop structure is simple and bounded.

### P4: Signal Count Enforcement (HIGH)
**Description:** V1 verifier requires exactly 5 public signals; V2 requires exactly 4.

**Verification approach:** Formal verification would prove:
- `verify_proof` returns `InvalidPublicSignal` when `pub_signals.len() ≠ 5`.
- `verify_proof_v2` processes exactly 4 signals.
- No off-by-one errors in the loop bounds.

**Feasibility on Soroban host:** High — simple length checks on `Vec`.

### P5: Verification Key Integrity (HIGH)
**Description:** The embedded VK constants (`VK_ALPHA`, `VK_BETA`, `VK_GAMMA`, `VK_DELTA`, `VK_IC`, plus V2 variants) are fixed at compile time and never modified.

**Verification approach:** Formal verification would prove:
- Each constant is immutable (enforced by Rust's `const` semantics).
- The encoding matches the expected G1/G2 serialization format (32-byte big-endian field elements).
- V2's `VK_GAMMA_V2` equals the canonical BN254 G2 generator.
- No VK constant is the identity point (all-zero).

**Feasibility on Soroban host:** High — compile-time constants.

---

## 3. Out-of-Scope Properties

| Property | Reason | Compensating Test Plan |
|----------|--------|----------------------|
| **Soundness of BN254 host functions** | Soroban's `bn254` host is part of the Stellar validator — not verifiable at the contract level. | Integration tests using known-valid and known-invalid proofs. |
| **Verification key authenticity** | The VK is embedded in the WASM binary; a malicious deployer could replace it. | CI checksum verification; deployment manifest includes `wasmHash` and VK hash. |
| **Circuit correctness** | The Groth16 circuit (`stealth_attestation.circom`) is out of scope for the on-chain verifier. | Circuit compilation with `snarkjs`; trusted setup ceremony; test vector generation. |
| **Rust integer overflow** | The `field_negate` function uses `overflowing_sub`. | Fuzz testing of `field_negate` with edge cases (0, 1, q-1, q). |
| **Soroban budget exhaustion** | The verifier could be called with large inputs that exceed the ledger budget. | Budget simulation tests in `verify_proof` footprint tests. |
| **Replay attacks across networks** | The verifier does not include `chain_id` in public signals. | This is a protocol-level concern, not a verifier bug. |
| **Groth16 proof malleability** | An adversary with a valid proof can malleate `proof_a` to produce a different valid proof for the same public signals (Groth16's `simulation` property). This does not break soundness — no false statements can be proven. | Nullifier-based replay protection in `ReputationVerifier` (marks nullifiers as spent); BN254 G1 is prime-order so no small-subgroup malleation applies. |

---

## 4. Toolchain Candidates

| Tool | Type | Suitability | Notes |
|------|------|-------------|-------|
| **Kani Rust Verifier** | Model checker (Rust) | **Best fit** | Supports `#![no_std]` contracts; can verify `is_valid_scalar`, `field_negate`, and loop bounds. Requires annotations (`#[kani::proof]`). |
| **Halmos** | Symbolic execution (EVM → Rust) | Partial | Designed for Solidity; could verify the EIP-197 equivalence of the pairing layout. |
| **Coq + Bedrock** | Interactive theorem prover | Overkill | Would require translating the entire Soroban SDK into Coq. Excessive for a single contract. |
| **SMT Solver (Z3)** | Constraint solving | Used indirectly | Kani uses Z3/CBMC internally. Direct Z3 usage would require manual model translation. |

### Recommendation

**Kani Rust Verifier** is the recommended toolchain because:
1. It operates directly on Rust code with `no_std` support.
2. It can verify bounded loops (P3, P4) and pure functions (P1, P5).
3. It is actively maintained by Amazon and used in production.

**Limitations:** Kani cannot verify properties that depend on Soroban host function semantics (P2's pairing correctness). These must be covered by integration tests.

---

## 5. Estimated Effort

| Property | Tool | Effort | Confidence |
|----------|------|--------|------------|
| P1 — Scalar validity | Kani | 1 day | High |
| P2 — Pairing layout | Kani (input encoding) + manual audit | 3 days | Medium |
| P3 — VK linear combination | Kani | 2 days | High |
| P4 — Signal count | Kani | 0.5 day | High |
| P5 — VK integrity | Kani | 1 day | High |

**Total estimate:** ~7.5 days for initial proof harnesses.

---

## 6. Risks

1. **Kani + Soroban SDK compatibility:** Soroban's SDK may use features Kani does not support (e.g., inline assembly, unstable intrinsics). Mitigation: wrap the verifier in a `kani-compatible` shim that replaces host calls with stubs.
2. **Verification key size:** The V2 VK comparison constants (128-byte G2 points) may hit Kani's unwinding limits. Mitigation: verify field element extraction separately.
3. **Host function black box:** Pairing correctness ultimately depends on Stellar validators. Formal verification of the input encoding is the best we can do on-chain.
