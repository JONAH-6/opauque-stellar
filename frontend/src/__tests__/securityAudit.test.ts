import { describe, it, expect } from "vitest";
import {
  MAINNET_AUDIT_COMPONENTS,
  MAINNET_SIGNOFF_STATUS,
  OPEN_BLOCKING_FINDING_IDS,
  SECURITY_AUDIT_DOCS,
  isMainnetAuditApproved,
  isMainnetDeployAllowedByAudit,
} from "../lib/securityAudit";

describe("securityAudit", () => {
  it("documents all mainnet audit components", () => {
    expect(MAINNET_AUDIT_COMPONENTS.length).toBe(5);
    expect(MAINNET_AUDIT_COMPONENTS.some((c) => c.includes("contracts"))).toBe(true);
    expect(MAINNET_AUDIT_COMPONENTS.some((c) => c.includes("Frontend"))).toBe(true);
  });

  it("references audit documentation paths", () => {
    expect(SECURITY_AUDIT_DOCS.findings).toContain("mainnet-audit-findings.json");
    expect(SECURITY_AUDIT_DOCS.signoff).toContain("SIGNOFF");
  });

  it("aligns TS constants with findings JSON register", () => {
    expect(MAINNET_SIGNOFF_STATUS).toBe("blocked");
    expect(OPEN_BLOCKING_FINDING_IDS).toContain("SEC-001");
    expect(OPEN_BLOCKING_FINDING_IDS).toContain("SEC-002");
  });

  it("blocks mainnet deploy until audit approved", () => {
    expect(isMainnetAuditApproved()).toBe(false);
    expect(isMainnetDeployAllowedByAudit()).toBe(false);
  });
});
