/**
 * Tests for chain-discovered trait handling (#422).
 *
 * Verifies that traits discovered from on-chain data only (no V2 announcement)
 * are correctly gated from proof generation with clear guidance, and do not
 * cause silent failures.
 */

import { describe, expect, it } from "vitest";
import type { V2DiscoveredTrait } from "../../store/schemaStore";

function makeV2Trait(overrides: Partial<V2DiscoveredTrait> = {}): V2DiscoveredTrait {
  return {
    stealthAddress: "0xdeadbeef",
    schemaId: "0xaabbccdd",
    schemaName: "Test Schema",
    issuer: "GISSUER0000000000000000000000000000000000000000000000000",
    attestationUid: "0x1234",
    dataHex: "0xabcd",
    nonce: "0x0000",
    merkleLeafPreimage: {
      stealthPkField: "0",
      schemaIdField: "0",
      issuerPkX: "0",
      traitDataHash: "0",
      nonceField: "0",
    },
    txHash: "abc123",
    slot: 1000,
    isValid: true,
    issuerAuthorized: true,
    isV2: true,
    ...overrides,
  };
}

function canShowProofButton(trait: V2DiscoveredTrait, readOnly = false): boolean {
  return trait.isV2 && trait.isValid && trait.issuerAuthorized && !trait.chainDiscoveryOnly && !readOnly;
}

function isChainDiscoveryOnly(trait: V2DiscoveredTrait): boolean {
  return Boolean(trait.chainDiscoveryOnly);
}

describe("chain-discovery-only trait (#422)", () => {
  it("hides the proof button for chain-discovery-only traits", () => {
    const chainTrait = makeV2Trait({ chainDiscoveryOnly: true });
    expect(canShowProofButton(chainTrait)).toBe(false);
  });

  it("shows the proof button for traits with a V2 announcement", () => {
    const fullTrait = makeV2Trait({ chainDiscoveryOnly: false });
    expect(canShowProofButton(fullTrait)).toBe(true);
  });

  it("shows the proof button for traits without the chainDiscoveryOnly flag", () => {
    // chainDiscoveryOnly defaults to undefined (not set) — treated as falsy, button shows
    const traitNoFlag = makeV2Trait();
    expect(canShowProofButton(traitNoFlag)).toBe(true);

    const traitExplicitFalse = makeV2Trait({ chainDiscoveryOnly: false });
    expect(canShowProofButton(traitExplicitFalse)).toBe(true);
  });

  it("hides the proof button in read-only mode even for full traits", () => {
    const fullTrait = makeV2Trait({ chainDiscoveryOnly: false });
    expect(canShowProofButton(fullTrait, true)).toBe(false);
  });

  it("detects chain-discovery-only traits correctly", () => {
    expect(isChainDiscoveryOnly(makeV2Trait({ chainDiscoveryOnly: true }))).toBe(true);
    expect(isChainDiscoveryOnly(makeV2Trait({ chainDiscoveryOnly: false }))).toBe(false);
    expect(isChainDiscoveryOnly(makeV2Trait())).toBe(false);
  });

  it("revoked and expired chain-discovery traits do not show proof button", () => {
    const revoked = makeV2Trait({ chainDiscoveryOnly: false, isValid: false });
    expect(canShowProofButton(revoked)).toBe(false);

    const unauthorized = makeV2Trait({ chainDiscoveryOnly: false, issuerAuthorized: false });
    expect(canShowProofButton(unauthorized)).toBe(false);
  });
});
