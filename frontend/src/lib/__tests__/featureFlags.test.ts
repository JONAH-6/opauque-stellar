import { describe, expect, it } from "vitest";
import { buildFeatureFlags } from "../featureFlags";

describe("buildFeatureFlags", () => {
  const baseOpts = {
    network: "testnet" as const,
    env: {} as Record<string, string | undefined>,
    isDev: true,
  };

  it("defaults reputationProofs to true on testnet", () => {
    const flags = buildFeatureFlags(baseOpts);
    expect(flags.reputationProofs).toBe(true);
  });

  it("defaults reputationProofs to false on mainnet", () => {
    const flags = buildFeatureFlags({ ...baseOpts, network: "mainnet" });
    expect(flags.reputationProofs).toBe(false);
  });

  it("respects explicit env override to false", () => {
    const flags = buildFeatureFlags({
      ...baseOpts,
      env: { VITE_FEATURE_REPUTATION_PROOFS: "false" },
    });
    expect(flags.reputationProofs).toBe(false);
  });

  it("respects explicit env override to true on mainnet", () => {
    const flags = buildFeatureFlags({
      ...baseOpts,
      network: "mainnet",
      env: { VITE_FEATURE_REPUTATION_PROOFS: "true" },
    });
    expect(flags.reputationProofs).toBe(true);
  });

  it("defaults schemaManagement to true on testnet", () => {
    const flags = buildFeatureFlags(baseOpts);
    expect(flags.schemaManagement).toBe(true);
  });

  it("defaults schemaManagement to false on mainnet", () => {
    const flags = buildFeatureFlags({ ...baseOpts, network: "mainnet" });
    expect(flags.schemaManagement).toBe(false);
  });

  it("respects runtime override", () => {
    const flags = buildFeatureFlags({
      ...baseOpts,
      network: "mainnet",
      runtimeOverride: { reputationProofs: true },
    });
    expect(flags.reputationProofs).toBe(true);
    expect(flags.schemaManagement).toBe(false);
  });
});
