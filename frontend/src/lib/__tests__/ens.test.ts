import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isStellarAddress,
  isFederationIdentifier,
  getFederationServer,
  resolveDomain,
} from "../ens";

describe("isStellarAddress", () => {
  it("accepts a plain stellar address-like name", () => {
    expect(isStellarAddress("alice")).toBe(true);
  });

  it("accepts a federation identifier", () => {
    expect(isStellarAddress("alice*stellar.org")).toBe(true);
  });

  it("rejects empty input", () => {
    expect(isStellarAddress("")).toBe(false);
  });
});

describe("isFederationIdentifier", () => {
  it("matches name*domain format", () => {
    expect(isFederationIdentifier("alice*stellar.org")).toBe(true);
    expect(isFederationIdentifier("bob*example.com")).toBe(true);
  });

  it("rejects plain names without asterisk", () => {
    expect(isFederationIdentifier("alice")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isFederationIdentifier("")).toBe(false);
  });
});

describe("getFederationServer", () => {
  it("derives server URL from identifier", () => {
    expect(getFederationServer("alice*stellar.org")).toBe(
      "https://federation.stellar.org",
    );
  });

  it("returns null for non-federation input", () => {
    expect(getFederationServer("alice")).toBeNull();
  });
});

describe("resolveDomain", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for empty input", async () => {
    expect(await resolveDomain("")).toBeNull();
  });

  it("returns null for non-federation input", async () => {
    expect(await resolveDomain("alice")).toBeNull();
  });

  it("returns account_id on successful federation lookup", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ account_id: "GA7QYNF7SOWQ3GLR2BGM4LOGSMYT4U3Y2JZ3VJ3F5Y5Q4H5K6L7M8N9O0" }),
    } as Response);

    const result = await resolveDomain("alice*stellar.org");
    expect(result).toBe("GA7QYNF7SOWQ3GLR2BGM4LOGSMYT4U3Y2JZ3VJ3F5Y5Q4H5K6L7M8N9O0");
  });

  it("returns null when federation server is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
    const result = await resolveDomain("alice*stellar.org");
    expect(result).toBeNull();
  });

  it("returns null on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const result = await resolveDomain("alice*stellar.org");
    expect(result).toBeNull();
  });

  it("returns null when account_id is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const result = await resolveDomain("alice*stellar.org");
    expect(result).toBeNull();
  });
});
