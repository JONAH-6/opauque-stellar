#!/usr/bin/env tsx
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

type CircuitThreshold = {
  source: string;
  maxConstraints: number;
  reason: string;
  lastVerified: string;
};

type Thresholds = {
  version: number;
  circuits: Record<string, CircuitThreshold>;
};

function loadThresholds(): Thresholds {
  const path = resolve(ROOT, "circuits", "constraint-thresholds.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

function getR1csPath(version: string): string {
  if (version === "v1") {
    return resolve(ROOT, "circuits", "build", "stealth_attestation.r1cs");
  }
  return resolve(ROOT, "circuits", "v2", "build", "stealth_reputation.r1cs");
}

function extractConstraintCount(r1csPath: string): number {
  if (!existsSync(r1csPath)) {
    throw new Error(`R1CS not found at ${r1csPath} (run circom build first)`);
  }
  const output = execSync(`npx snarkjs r1cs info ${r1csPath}`, {
    encoding: "utf-8",
  });
  const match = output.match(/# of Constraints:\s*(\d+)/);
  if (!match) {
    throw new Error(`Could not parse constraint count from:\n${output}`);
  }
  return parseInt(match[1], 10);
}

function parseArgs(argv: string[]): { ci: boolean } {
  return { ci: argv.includes("--ci") };
}

function main(): void {
  const opts = parseArgs(process.argv);
  const thresholds = loadThresholds();
  const errors: string[] = [];
  const results: {
    circuit: string;
    constraints: number;
    maxConstraints: number;
    pass: boolean;
  }[] = [];

  for (const [version, threshold] of Object.entries(thresholds.circuits)) {
    try {
      const r1csPath = getR1csPath(version);
      const constraints = extractConstraintCount(r1csPath);
      const pass = constraints <= threshold.maxConstraints;
      results.push({
        circuit: version,
        constraints,
        maxConstraints: threshold.maxConstraints,
        pass,
      });

      if (!pass) {
        errors.push(
          `${version}: ${constraints} constraints exceeds threshold of ${threshold.maxConstraints}. ${threshold.reason}`,
        );
      }
    } catch (err) {
      errors.push(`${version}: ${(err as Error).message}`);
    }
  }

  if (opts.ci) {
    console.log(JSON.stringify({ results, errors, success: errors.length === 0 }, null, 2));
  } else {
    console.log("\nCircuit Constraint Count Report\n");
    for (const r of results) {
      const status = r.pass ? "PASS" : "FAIL";
      const pct = ((r.constraints / r.maxConstraints) * 100).toFixed(1);
      console.log(`  ${status}: ${r.circuit} ${r.constraints}/${r.maxConstraints} constraints (${pct}%)`);
    }
    if (errors.length > 0) {
      console.log("\nErrors:");
      for (const e of errors) console.log(`  - ${e}`);
    }
    console.log();
  }

  if (errors.length > 0) process.exit(1);
}

main();
