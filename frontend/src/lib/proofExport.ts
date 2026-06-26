import { sha256 } from "@noble/hashes/sha2";

const CURRENT_SCHEMA_VERSION = 1;

export interface PortableProofV1 {
  schemaVersion: 1;
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
  metadata: {
    circuitVersion: "v1" | "v2";
    generatedAt: string;
    nullifier?: string;
    attestationId?: number;
    schemaId?: string;
    externalNullifier?: string;
  };
  checksum: string;
}

export type PortableProof = PortableProofV1;

function computeChecksum(payload: Omit<PortableProofV1, "checksum">): string {
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(payload));
  const hash = sha256(data);
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ExportProofParams {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
  circuitVersion: "v1" | "v2";
  nullifier?: string;
  attestationId?: number;
  schemaId?: string;
  externalNullifier?: string;
}

export function createPortableProof(params: ExportProofParams): PortableProofV1 {
  const metadata = {
    circuitVersion: params.circuitVersion,
    generatedAt: new Date().toISOString(),
  };
  if (params.nullifier != null) metadata.nullifier = params.nullifier;
  if (params.attestationId != null) metadata.attestationId = params.attestationId;
  if (params.schemaId != null) metadata.schemaId = params.schemaId;
  if (params.externalNullifier != null) metadata.externalNullifier = params.externalNullifier;

  const payload = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    proof: params.proof,
    publicSignals: params.publicSignals,
    metadata,
  };

  return {
    ...payload,
    checksum: computeChecksum(payload),
  };
}

export function validatePortableProof(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Invalid proof file: not a JSON object" };
  }

  const obj = data as Record<string, unknown>;

  if (obj.schemaVersion !== 1) {
    return { valid: false, error: `Unsupported schema version: ${obj.schemaVersion}` };
  }

  if (!obj.proof || typeof obj.proof !== "object") {
    return { valid: false, error: "Missing proof field" };
  }

  const proof = obj.proof as Record<string, unknown>;
  if (!Array.isArray(proof.pi_a) || !Array.isArray(proof.pi_b) || !Array.isArray(proof.pi_c)) {
    return { valid: false, error: "Invalid proof structure" };
  }

  if (!Array.isArray(obj.publicSignals) || obj.publicSignals.length === 0) {
    return { valid: false, error: "Missing or empty publicSignals" };
  }

  if (!obj.metadata || typeof obj.metadata !== "object") {
    return { valid: false, error: "Missing metadata field" };
  }

  const meta = obj.metadata as Record<string, unknown>;
  if (meta.circuitVersion !== "v1" && meta.circuitVersion !== "v2") {
    return { valid: false, error: "Invalid circuit version (must be v1 or v2)" };
  }

  if (typeof obj.checksum !== "string") {
    return { valid: false, error: "Missing checksum" };
  }
  const expectedChecksum = computeChecksum({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    proof: proof as PortableProofV1["proof"],
    publicSignals: obj.publicSignals as string[],
    metadata: meta as PortableProofV1["metadata"],
  });
  if (obj.checksum !== expectedChecksum) {
    return { valid: false, error: "Checksum mismatch: file may be corrupted" };
  }

  return { valid: true };
}

export function exportProofToFile(proof: PortableProofV1): void {
  const dateStr = new Date().toISOString().split("T")[0];
  const fileName = `opaque-proof-${dateStr}.opqproof`;
  const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importProofFromFile(file: File): Promise<PortableProofV1> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const validation = validatePortableProof(data);
        if (!validation.valid) {
          reject(new Error(validation.error));
          return;
        }
        resolve(data as PortableProofV1);
      } catch {
        reject(new Error("Failed to parse proof file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read proof file"));
    reader.readAsText(file);
  });
}
