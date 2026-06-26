# Security

## Authorization

See [docs/AUTHORIZATION_MATRIX.md](docs/AUTHORIZATION_MATRIX.md) for the
cross-contract authorization matrix covering all admin-only and
authority-gated methods across Opaque Soroban contracts.

## Threat Model

- **Ghost key encryption threat model:** [docs/GHOST_THREAT_MODEL.md](docs/GHOST_THREAT_MODEL.md)

## Groth16 Proof Malleability

Groth16 proofs are **malleable**: an adversary who observes a valid proof
can modify the `proof_a` (G1) element by adding a known G1 point, producing
a different but still-valid proof for the same public signals. This does not
violate Groth16's soundness (no false statements can be proven), but it means
that on-chain nullifier replay protection must be **per nullifier hash**, not
per proof bytes. The `ReputationVerifier` contract correctly enforces this:
it marks nullifiers as spent and rejects any proof (original or malleated)
that uses an already-spent nullifier.

### Verifier Contract Status

The `Groth16Verifier` Soroban contract does **not** perform explicit subgroup
or non-malleability checks on proof elements. It relies on:

1. The BN254 prime-order G1 group (no small subgroup exists).
2. Nullifier-based replay protection in the `ReputationVerifier` caller.
3. Public signal scalar field validity checks (`is_valid_scalar`).

See [docs/FORMAL_VERIFICATION_SCOPING.md](docs/FORMAL_VERIFICATION_SCOPING.md)
for the formal verification scope, including malleability as an out-of-scope
property.

## Reporting a Vulnerability

This project is experimental and unaudited. If you discover a security issue,
please open a [GitHub Security Advisory](https://github.com/collinsadi/opauque-stellar/security/advisories/new).
