# Reputation Proof Integration Guide

This guide covers how to generate, export, and verify Groth16 zero-knowledge
reputation proofs with the Opaque protocol.

## Prerequisites

- A Stellar wallet (e.g., Freighter) with Opaque stealth meta-addresses registered.
- An attestation issued by a trusted issuer (see `attestation-engine-v2` contract).

## Proof Generation

Proofs are generated entirely in-browser using `snarkjs` and a WASM scanner.
The user's private keys never leave the device. See:

- `frontend/src/lib/reputationProver.ts` — V1 proof generation orchestrator
- `frontend/src/lib/proofWorker/` — Web Worker with snarkjs + circomlibjs
- `frontend/src/components/ProveTraitModal.tsx` — V1 proof generation UI
- `frontend/src/components/ProofGeneratorModal.tsx` — V2 proof generation UI

## Proof Structure

A Groth16 proof consists of:

- `pi_a` (G1 point) — 2 field elements (x, y)
- `pi_b` (G2 point) — 2x2 field elements (x_im, x_re, y_im, y_re)
- `pi_c` (G1 point) — 2 field elements (x, y)
- `publicSignals` — variable-length array of field elements

### V1 Public Signal Order

```
[0] nullifier
[1] is_valid        (must be 1)
[2] merkle_root
[3] attestation_id
[4] external_nullifier
```

### V2 Public Signal Order

```
[0] merkle_root
[1] attestation_id
[2] external_nullifier
[3] nullifier_hash
```

## Portable Proof Export

Proofs can be exported as portable JSON files for offline verification or
third-party submission. See `frontend/src/lib/proofExport.ts` for the format
and helpers.

## On-Chain Verification

Proofs are submitted to the `ReputationVerifier` Soroban contract (V1) or
`Groth16Verifier` contract (V2). The contract verifies the Groth16 pairing
equation and marks the nullifier as spent to prevent replay.

## Security Considerations

### Proof Malleability

Groth16 proofs are **malleable**: an observer can modify `pi_a` to produce
a different valid proof for the same public signals. This does **not** allow
proving false statements, but it means proof bytes are not unique. The
Opaque protocol handles this by:

1. **Nullifier-based replay protection**: The `ReputationVerifier` marks
   nullifiers as spent, rejecting any proof (original or malleated) that
   uses an already-spent nullifier.
2. **Prime-order group**: BN254 G1 has no small subgroup, so no subgroup
   malleation attacks apply.

For more details, see [SECURITY.md](../../SECURITY.md) and
[FORMAL_VERIFICATION_SCOPING.md](../../docs/FORMAL_VERIFICATION_SCOPING.md).
