import { buildPoseidon } from "circomlibjs";
import { bytesToFieldBigInt, stringToBigInt } from "./fieldUtils";
import type { V2WitnessParams } from "./types";

const MERKLE_DEPTH = 20;

export async function buildV2Witness(params: V2WitnessParams): Promise<Record<string, unknown>> {
  const stealthPrivKeyBytes = new Uint8Array(params.stealthPrivKeyBytes);
  const stealthPk = bytesToFieldBigInt(stealthPrivKeyBytes);

  const schemaId = stringToBigInt(params.schemaIdField);
  const issuerPkX = stringToBigInt(params.issuerPkX);
  const nonce = stringToBigInt(params.nonceField);
  const externalNullifier = stringToBigInt(params.externalNullifierStr.trim());

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const ph = (inputs: bigint[]): bigint => F.toObject(poseidon(inputs)) as bigint;

  // Compute traitDataHash from on-chain attestation payload when provided.
  // Bytes are packed into 31-byte BN254-safe chunks then Poseidon-hashed.
  let traitDataHash = 0n;
  if (params.traitDataHex && params.traitDataHex.replace(/^0x/, "").length > 0) {
    const hex = params.traitDataHex.replace(/^0x/, "");
    const dataBytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      dataBytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    const chunks: bigint[] = [];
    for (let i = 0; i < dataBytes.length; i += 31) {
      const chunk = dataBytes.slice(i, Math.min(i + 31, dataBytes.length));
      let n = 0n;
      for (const b of chunk) n = (n << 8n) | BigInt(b);
      chunks.push(n);
    }
    if (chunks.length > 0) traitDataHash = ph(chunks);
  }

  const leaf: bigint = ph([stealthPk, schemaId, issuerPkX, traitDataHash, nonce]);

  const zeroHashes: bigint[] = [0n];
  for (let i = 0; i < MERKLE_DEPTH; i++) {
    zeroHashes.push(ph([zeroHashes[i], zeroHashes[i]]));
  }

  const merklePath: bigint[] = [];
  const merklePathIndices: number[] = [];
  let current: bigint = leaf;
  for (let i = 0; i < MERKLE_DEPTH; i++) {
    merklePath.push(zeroHashes[i]);
    merklePathIndices.push(0);
    current = ph([current, zeroHashes[i]]);
  }
  const merkleRoot: bigint = current;
  const nullifierHash: bigint = ph([stealthPk, externalNullifier]);

  return {
    stealth_pk: stealthPk.toString(),
    schema_id: schemaId.toString(),
    issuer_pk_x: issuerPkX.toString(),
    trait_data_hash: traitDataHash.toString(),
    nonce: nonce.toString(),
    merkle_path: merklePath.map((h) => h.toString()),
    merkle_path_indices: merklePathIndices,
    merkle_root: merkleRoot.toString(),
    attestation_id: schemaId.toString(),
    external_nullifier: externalNullifier.toString(),
    nullifier_hash: nullifierHash.toString(),
  };
}
