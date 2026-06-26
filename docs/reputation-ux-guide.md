# Reputation UX Guide

## Nullifier Derivation (#406)

### Problem

`ProveTraitModal` previously generated the external nullifier with `Date.now()`.
This broke reproducibility: the same proof intent generated at different times (or on
different devices) produced different nullifier hashes, making cross-device verification
impossible.

### Solution

The external nullifier is now derived deterministically from two sources:

| Input | Source | Purpose |
|-------|--------|---------|
| Attestation UID | `trait.attestationId` | Binds the nullifier to this specific trait type |
| User entropy | First 16 bytes of the stealth private key | Unique per user; controlled by wallet seeds |

**Formula**:
```
external_nullifier = (attestation_id << 128) | stealth_priv_key_bytes[0..16]
```

The result fits within the BN254 scalar field (< 2^254) and is stable across devices as
long as the user's wallet seeds are the same.

In the V2 circuit the final nullifier recorded on-chain is:
```
nullifier_hash = Poseidon(stealth_pk, external_nullifier)
```

### Acceptance criteria

| Criterion | How it is met |
|-----------|---------------|
| Same inputs → same nullifier | Derivation is pure arithmetic from stable inputs |
| Unique per proof intent | `attestationId` varies per trait; `stealthPrivKey` varies per user |

---

## V2 Circuit Migration (#404)

`ProveTraitModal` now uses the V2 circuit (`stealth_reputation.wasm`). The V2 public
signal layout differs from V1:

| Index | V1 | V2 |
|-------|----|----|
| 0 | nullifier | merkle_root |
| 1 | is_valid | attestation_id |
| 2 | merkle_root | external_nullifier |
| 3 | attestation_id | nullifier_hash |
| 4 | external_nullifier | — |

The V1 path is guarded by `VITE_REPUTATION_PROOF_V1=true` and disabled in production.

---

## Trait Data Hash (#405)

The V2 witness builder computes `traitDataHash` from the binary attestation payload
(`dataHex`) rather than hardcoding `0n`. Bytes are packed into 31-byte BN254-safe chunks
and Poseidon-hashed:

```
traitDataHash = Poseidon(chunk_0, chunk_1, ...)
```

A zero value is still used when `traitDataHex` is absent (e.g. legacy V1 traits).

---

## Scanner Health Self-Test (#403)

After each wallet connect a one-shot self-test runs in the background:

1. **WASM init probe** — loads `/pkg/cryptography.js` and calls its default init.
2. **Ledger RPC probe** — calls `getLatestLedger()` on the configured Soroban endpoint.

The result is exposed via `useWallet()`:

```tsx
const { selfTestStatus, selfTestError } = useWallet();
// selfTestStatus: 'idle' | 'running' | 'pass' | 'fail'
```

**Remediation steps when `selfTestStatus === 'fail'`:**

- *WASM error*: Ensure `/pkg/cryptography.js` and the `.wasm` file are deployed and the
  server sets the correct `Content-Type: application/wasm` header.
- *RPC error*: Check the configured `VITE_SOROBAN_RPC_URL`. If using a public endpoint,
  confirm it is reachable and not rate-limiting the client.

The self-test does not block any wallet functionality — it runs silently in the background.
