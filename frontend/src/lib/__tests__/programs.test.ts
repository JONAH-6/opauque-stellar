import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../chain", () => ({
  getNetwork: vi.fn(),
}));

import { getNetwork } from "../chain";
import { fetchAllSchemas, fetchAllAttestations, fetchAttestationPDA } from "../programs";

describe("stub functions — mainnet guard", () => {
  beforeEach(() => {
    vi.mocked(getNetwork).mockReturnValue("testnet");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchAllSchemas", () => {
    it("returns [] on testnet", async () => {
      const result = await fetchAllSchemas();
      expect(result).toEqual([]);
    });

    it("throws on mainnet", async () => {
      vi.mocked(getNetwork).mockReturnValue("mainnet");
      await expect(fetchAllSchemas()).rejects.toThrow(
        "fetchAllSchemas is not available on mainnet",
      );
    });
  });

  describe("fetchAllAttestations", () => {
    it("returns [] on testnet", async () => {
      const result = await fetchAllAttestations();
      expect(result).toEqual([]);
    });

    it("throws on mainnet", async () => {
      vi.mocked(getNetwork).mockReturnValue("mainnet");
      await expect(fetchAllAttestations()).rejects.toThrow(
        "fetchAllAttestations is not available on mainnet",
      );
    });
  });

  describe("fetchAttestationPDA", () => {
    it('returns "" on testnet', async () => {
      const result = await fetchAttestationPDA();
      expect(result).toBe("");
    });

    it("throws on mainnet", async () => {
      vi.mocked(getNetwork).mockReturnValue("mainnet");
      await expect(fetchAttestationPDA()).rejects.toThrow(
        "fetchAttestationPDA is not available on mainnet",
      );
    });
  });
});
