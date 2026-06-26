# Changelog

## [Unreleased]

### Changed

- **#404 – V2 circuit migration**: `ProveTraitModal` now generates proofs using the V2
  circuit (`stealth_reputation.wasm`) via `generateV2ProofInWorker`. The V1 code path
  is kept behind the `VITE_REPUTATION_PROOF_V1=true` environment variable for rollout
  verification and is disabled by default.

- **#406 – Deterministic external nullifier**: Replaced `Date.now()` with a value derived
  from the attestation UID and the user's stealth private-key bytes so the same inputs
  always produce the same nullifier. See `docs/reputation-ux-guide.md` for details.

### Added

- **#405 – Trait data hash**: `buildV2Witness()` now accepts an optional `traitDataHex`
  field and computes `traitDataHash = Poseidon(packed_chunks)` instead of hardcoding `0n`.
  `ProofGeneratorModal` passes `trait.dataHex` so V2 proofs are bound to the on-chain
  attestation payload.

- **#403 – Scanner health self-test**: A lightweight self-test (WASM init + single
  `getLatestLedger` RPC probe) runs once per browser session after the wallet connects.
  Status (`idle | running | pass | fail`) and any error message are exposed on
  `useWallet()` as `selfTestStatus` and `selfTestError`.
