import { describe, it, expect } from "vitest";
import {
  createPortableProof,
  validatePortableProof,
} from "../proofExport";

describe("Portable proof export (Issue #414)", () => {
  it("creates valid portable proof with checksum", () => {
    const portable = createPortableProof({
      proof: {
        pi_a: ["1", "2"],
        pi_b: [["3", "4"], ["5", "6"]],
        pi_c: ["7", "8"],
      },
      publicSignals: ["9", "10", "11", "12", "13"],
      circuitVersion: "v1",
      nullifier: "9",
      attestationId: 42,
      externalNullifier: "1001",
    });

    expect(portable.schemaVersion).toBe(1);
    expect(portable.proof.pi_a).toEqual(["1", "2"]);
    expect(portable.publicSignals).toHaveLength(5);
    expect(portable.metadata.circuitVersion).toBe("v1");
    expect(portable.metadata.nullifier).toBe("9");
    expect(portable.metadata.attestationId).toBe(42);
    expect(portable.metadata.externalNullifier).toBe("1001");
    expect(portable.checksum).toBeTruthy();
    expect(portable.checksum.length).toBe(64);
  });

  it("validates a correct portable proof", () => {
    const portable = createPortableProof({
      proof: {
        pi_a: ["1", "2"],
        pi_b: [["3", "4"], ["5", "6"]],
        pi_c: ["7", "8"],
      },
      publicSignals: ["9"],
      circuitVersion: "v2",
      nullifier: "99",
    });

    const result = validatePortableProof(portable);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects tampered proof data via checksum mismatch", () => {
    const portable = createPortableProof({
      proof: {
        pi_a: ["1", "2"],
        pi_b: [["3", "4"], ["5", "6"]],
        pi_c: ["7", "8"],
      },
      publicSignals: ["9"],
      circuitVersion: "v1",
    });

    (portable.publicSignals as string[]) = ["99"];
    const result = validatePortableProof(portable);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Checksum mismatch");
  });

  it("rejects unsupported schema version", () => {
    const result = validatePortableProof({ schemaVersion: 99 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unsupported schema version");
  });

  it("rejects missing proof field", () => {
    const result = validatePortableProof({ schemaVersion: 1 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing proof field");
  });

  it("rejects invalid circuit version", () => {
    const result = validatePortableProof({
      schemaVersion: 1,
      proof: { pi_a: [], pi_b: [], pi_c: [] },
      publicSignals: ["1"],
      metadata: { circuitVersion: "v3" },
      checksum: "0".repeat(64),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid circuit version");
  });

  it("v2 proof can be created with schemaId", () => {
    const portable = createPortableProof({
      proof: {
        pi_a: ["1", "2"],
        pi_b: [["3", "4"], ["5", "6"]],
        pi_c: ["7", "8"],
      },
      publicSignals: ["10", "20", "30", "40"],
      circuitVersion: "v2",
      schemaId: "schema-123",
      externalNullifier: "9001",
    });

    expect(portable.metadata.circuitVersion).toBe("v2");
    expect(portable.metadata.schemaId).toBe("schema-123");
    expect(portable.metadata.externalNullifier).toBe("9001");
    expect(portable.checksum.length).toBe(64);
  });

  it("contains no private witness data in export", () => {
    const portable = createPortableProof({
      proof: {
        pi_a: ["1", "2"],
        pi_b: [["3", "4"], ["5", "6"]],
        pi_c: ["7", "8"],
      },
      publicSignals: ["9", "10", "11", "12", "13"],
      circuitVersion: "v1",
      nullifier: "9",
      attestationId: 42,
    });

    const serialized = JSON.stringify(portable);
    expect(serialized).not.toContain("stealth_private_key");
    expect(serialized).not.toContain("stealthPrivKey");
    expect(serialized).not.toContain("merkle_path");
    expect(serialized).not.toContain("private");
  });
});
