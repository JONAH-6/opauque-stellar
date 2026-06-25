# Cross-Contract Authorization Matrix

> **Last updated:** 2026-06-25
> **Scope:** All Opaque Soroban contracts (v1)

## Legend

| Symbol | Meaning |
|--------|---------|
| `A` | `require_auth()` — caller must authenticate |
| `✓` | Additional authorization check (admin/authority match, cross-contract) |
| `—` | No authorization required (public) |

---

## 1. StealthRegistry

| Method | Auth | Check | Notes |
|--------|------|-------|-------|
| `register_keys(registrant, scheme_id, meta_address)` | `A(registrant)` | `meta_address.len() == 66` | **Self-authenticated** — only the registrant may register their own keys |
| `increment_nonce(registrant)` | `A(registrant)` | — | **Self-authenticated** |
| `resolve(registrant, scheme_id)` | — | — | Public read |

**Admin concept:** None. No admin key or privileged role exists.

---

## 2. StealthAnnouncer

| Method | Auth | Check | Notes |
|--------|------|-------|-------|
| `announce(caller, scheme_id, ...)` | `A(caller)` | `ephemeral_pub_key.len() == 33`, `!metadata.is_empty()` | **Self-authenticated** — caller must be the one announcing |
| `announce_with_log(caller, scheme_id, ..., log_id)` | `A(caller)` | Same validation + stores log | **Self-authenticated** |

**Admin concept:** None. No admin key or privileged role exists.

---

## 3. SchemaRegistry

| Method | Auth | Check | Notes |
|--------|------|-------|-------|
| `register_schema(authority, schema_id, ...)` | `A(authority)` | Name ≤64, field_defs ≤256, schema_id must be unique | **Authority-gated** |
| `add_delegate(authority, schema_id, delegate)` | `A(authority)` | `schema.authority == authority`, delegates ≤10, no duplicate | **Authority-gated** — only schema authority may add delegates |
| `remove_delegate(authority, schema_id, delegate)` | `A(authority)` | `schema.authority == authority`, delegate must exist | **Authority-gated** |
| `deprecate_schema(authority, schema_id)` | `A(authority)` | `schema.authority == authority` | **Authority-gated** |
| `is_authorized_issuer(schema_id, issuer)` | — | — | Public read |
| `is_revocable(schema_id)` | — | — | Public read |
| `get_schema(schema_id)` | — | — | Public read |

**Admin concept:** Schema authority. Each schema has exactly one authority account that owns it.

---

## 4. AttestationEngineV2

| Method | Auth | Check | Notes |
|--------|------|-------|-------|
| `attest(issuer, schema_id, schema_registry, stealth_hash, data, ...)` | `A(issuer)` | Data ≤512, expiration in future, cross-contract `is_authorized_issuer(schema_id, issuer)` via `schema_registry` | **Issuer-gated + cross-contract auth** |
| `revoke_attestation(revoker, uid, schema_registry)` | `A(revoker)` | Cross-contract `is_revocable(schema_id)`, cross-contract `is_authorized_issuer(schema_id, revoker)` or `revoker == attestation.issuer` | **Revoker-gated + cross-contract auth** |

**Admin concept:** None directly. Authorization is delegated to `SchemaRegistry` via cross-contract calls.

---

## 5. Groth16Verifier

| Method | Auth | Check | Notes |
|--------|------|-------|-------|
| `verify_proof(proof_a, proof_b, proof_c, pub_signals)` | — | `pub_signals.len() == 5`, scalar validity | Public — anyone may verify a proof |
| `verify_proof_v2(proof_a, proof_b, proof_c, public_inputs)` | — | Scalar validity | Public — anyone may verify a proof |

**Admin concept:** None. Pure verification — no privileged state.

---

## 6. ReputationVerifier

| Method | Auth | Check | Notes |
|--------|------|-------|-------|
| `initialize(admin, groth16_verifier)` | `A(admin)` | Must not already be initialized | **Admin-gated** (single-use) |
| `update_merkle_root(admin, root, dataset_hash)` | `A(admin)` | `config.admin == admin`, must not be frozen | **Admin-gated** |
| `set_root_expiry(admin, expiry_ledgers)` | `A(admin)` | `config.admin == admin` | **Admin-gated** |
| `set_frozen(admin, frozen)` | `A(admin)` | `config.admin == admin` | **Admin-gated** |
| `transfer_admin(admin, new_admin)` | `A(admin)` | `config.admin == admin`, timelock disabled | **Admin-gated** |
| `set_timelock_delay(admin, delay_ledgers)` | `A(admin)` | `config.admin == admin` | **Admin-gated** |
| `schedule_update_merkle_root(admin, root, dataset_hash)` | `A(admin)` | `config.admin == admin`, timelock enabled | **Admin-gated** |
| `schedule_admin_transfer(admin, new_admin)` | `A(admin)` | `config.admin == admin`, timelock enabled | **Admin-gated** |
| `cancel_pending_action(admin, action_id)` | `A(admin)` | `config.admin == admin` | **Admin-gated** |
| `execute_pending_action(admin, action_id)` | `A(admin)` | `config.admin == admin` | **Admin-gated** |
| `verify_reputation(user, groth16_verifier, ...)` | `A(user)` | `config.groth16_verifier == groth16_verifier`, root not expired, nullifier not used, Groth16 proof valid | **User-gated + verifier binding** |
| `get_latest_root()` | — | — | Public read |
| `get_root_history(offset, limit)` | — | — | Public read |
| `get_pending_action(action_id)` | — | — | Public read |
| `is_frozen()` | — | — | Public read |
| `last_root_update()` | — | — | Public read |
| `get_timelock_delay()` | — | — | Public read |
| `nullifier_batch_limit()` | — | — | Public read |
| `are_nullifiers_spent(ids)` | — | Batch ≤ `MAX_NULLIFIER_BATCH_SIZE` | Public read |

**Admin concept:** Single admin address stored in `VerifierConfig`. Controls all privileged operations.

---

## Cross-Contract Call Flow

```
User → SchemaRegistry.register_schema      (self-auth)
User → SchemaRegistry.add_delegate         (self-auth)  
User → SchemaRegistry.deprecate_schema     (self-auth)

User → AttestationEngineV2.attest           (self-auth + cross-call to SchemaRegistry)
User → AttestationEngineV2.revoke_attestation (self-auth + cross-call to SchemaRegistry)

User → ReputationVerifier.update_merkle_root   (admin-gated)
User → ReputationVerifier.set_root_expiry      (admin-gated)
User → ReputationVerifier.verify_reputation    (self-auth + cross-call to Groth16Verifier)

ReputationVerifier → Groth16Verifier.verify_proof   (internal cross-call)
AttestationEngineV2 → SchemaRegistry.is_authorized_issuer  (internal cross-call)
AttestationEngineV2 → SchemaRegistry.is_revocable          (internal cross-call)
```

## Security Boundary Summary

| Contract | Trust Assumption | Risk |
|----------|-----------------|------|
| StealthRegistry | Registrant controls own keys | No central admin to compromise |
| StealthAnnouncer | Caller pays and announces | No central admin to compromise |
| SchemaRegistry | Authority account is not compromised | Single point of failure per schema |
| AttestationEngineV2 | SchemaRegistry returns correct auth | Trusts SchemaRegistry's `is_authorized_issuer` |
| Groth16Verifier | VK constants are correct | If VK is replaced, all proofs are forgeable |
| ReputationVerifier | Admin account is not compromised | Admin can publish arbitrary roots, freeze contract |
