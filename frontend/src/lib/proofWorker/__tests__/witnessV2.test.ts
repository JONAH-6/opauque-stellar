import { describe, it, expect, vi } from "vitest";

// Mock circomlibjs with a simple additive Poseidon so the test stays synchronous
// and does not require a WASM runtime. The mock is structurally identical to the
// real library's interface: buildPoseidon() returns an object with a .F property.
vi.mock("circomlibjs", () => ({
  buildPoseidon: async () => {
    const poseidon = Object.assign(
      // Simple non-cryptographic stand-in: sum of inputs (mod a large prime)
      (inputs: bigint[]) => inputs.reduce((a, b) => a + b, 0n),
      { F: { toObject: (x: bigint) => x } },
    );
    return poseidon;
  },
}));

describe("buildV2Witness – traitDataHash", () => {
  const baseParams = {
    stealthPrivKeyBytes: Array(32).fill(1) as number[],
    schemaIdField: "2",
    issuerPkX: "0",
    nonceField: "0",
    externalNullifierStr: "42",
  };

  it("uses 0 when traitDataHex is not provided", async () => {
    const { buildV2Witness } = await import("../witnessV2");
    const w = await buildV2Witness(baseParams);
    expect(w.trait_data_hash).toBe("0");
  });

  it("uses 0 when traitDataHex is empty (0x)", async () => {
    const { buildV2Witness } = await import("../witnessV2");
    const w = await buildV2Witness({ ...baseParams, traitDataHex: "0x" });
    expect(w.trait_data_hash).toBe("0");
  });

  it("computes non-zero hash for known fixture 0x01020304", async () => {
    const { buildV2Witness } = await import("../witnessV2");
    // Fixture: 4 bytes → one 31-byte chunk → chunk value = 0x01020304 = 16909060
    // Mock Poseidon([16909060n]) = 16909060n  (sum of one element)
    const w = await buildV2Witness({ ...baseParams, traitDataHex: "0x01020304" });
    expect(w.trait_data_hash).toBe("16909060");
  });

  it("produces a different leaf when traitDataHex changes", async () => {
    const { buildV2Witness } = await import("../witnessV2");
    const withData = await buildV2Witness({ ...baseParams, traitDataHex: "0xdeadbeef" });
    const withoutData = await buildV2Witness(baseParams);
    expect(withData.merkle_root).not.toBe(withoutData.merkle_root);
  });
});
