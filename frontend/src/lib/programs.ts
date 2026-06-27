/**
 * Soroban contract invocation helpers for Schema Registry, Attestation Engine, Groth16.
 */

import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  StrKey,
  xdr,
} from "@stellar/stellar-sdk";
import { deployedAddresses } from "../contracts/deployedAddresses";
import { bytesToScVal, getSorobanServer, invokeContractMethod } from "./stellar";
import type { SignTxFn } from "./stellar";
import { bytesN32ToScVal } from "./scvalEncoding";
import { getNetworkPassphrase } from "./chain";
import { isSimulationSuccess } from "./sorobanErrors";

export const SCHEMA_REGISTRY_CONTRACT_ID = deployedAddresses.schemaRegistry;
export const ATTESTATION_ENGINE_V2_CONTRACT_ID = deployedAddresses.attestationEngineV2;
export const GROTH16_VERIFIER_CONTRACT_ID = deployedAddresses.groth16Verifier;

export interface SorobanInvocationInstruction {
  contractId: string;
  method: string;
  args: ReturnType<typeof nativeToScVal>[];
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeBytes32(value: Uint8Array, label: string): Uint8Array {
  if (value.length !== 32) {
    throw new Error(`${label} must be exactly 32 bytes; received ${value.length}.`);
  }
  return value;
}

export function mapSchemaManagementError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Unauthorized|Error\(Contract, #4\)|#4\b/i.test(message)) {
    return "Only the schema authority can deprecate this schema.";
  }
  if (/already.?deprecated|deprecated/i.test(message)) {
    return "This schema has already been deprecated.";
  }
  if (/not.?found|missing|schema/i.test(message)) {
    return "Schema was not found on-chain. Refresh and try again.";
  }
  return message || "Schema management transaction failed.";
}

export function mapAttestationIssuanceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/SchemaDeprecated|Error\(Contract, #13\)|#13\b/i.test(message)) {
    return "This schema has been deprecated and no longer accepts new attestations.";
  }
  if (/SchemaExpired|Error\(Contract, #14\)|#14\b/i.test(message)) {
    return "This schema has expired and no longer accepts new attestations.";
  }
  if (/UnauthorizedIssuer|Error\(Contract, #2\)|#2\b/i.test(message)) {
    return "Your wallet is not an authorized issuer for this schema.";
  }
  if (/Paused|Error\(Contract, #11\)|#11\b/i.test(message)) {
    return "Attestation issuance is currently paused by the contract admin.";
  }
  if (/DataTooLarge|Error\(Contract, #1\)|#1\b/i.test(message)) {
    return "Attestation data exceeds the maximum allowed size.";
  }
  if (/InvalidAttestationData|Error\(Contract, #12\)|#12\b/i.test(message)) {
    return "Attestation data does not match the schema field definitions.";
  }
  if (/ExpirationInPast|Error\(Contract, #3\)|#3\b/i.test(message)) {
    return "The specified expiration ledger is already in the past.";
  }
  if (/SchemaNotFound|Error\(Contract, #15\)|#15\b/i.test(message)) {
    return "Schema was not found on-chain. Verify the schema ID and try again.";
  }
  return message || "Attestation issuance failed.";
}

export function mapAttestationRevocationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/AlreadyRevoked|already revoked|Error\(Contract, #5\)|#5\b/i.test(message)) {
    return "This attestation has already been revoked.";
  }
  if (/AttestationNotFound|not.?found|Error\(Contract, #4\)|#4\b/i.test(message)) {
    return "Attestation was not found on-chain. Refresh and try again.";
  }
  if (/NotRevocable|not revocable|Error\(Contract, #6\)|#6\b/i.test(message)) {
    return "This schema does not allow attestation revocation.";
  }
  if (/Unauthorized|Error\(Contract, #7\)|#7\b/i.test(message)) {
    return "Only the issuer, schema authority, or authorized delegate can revoke this attestation.";
  }
  return message || "Attestation revocation transaction failed.";
}

export function buildDeprecateSchemaInstruction(opts: {
  authority: string;
  schemaId: Uint8Array;
}): SorobanInvocationInstruction {
  return {
    contractId: SCHEMA_REGISTRY_CONTRACT_ID,
    method: "deprecate_schema",
    args: [
      nativeToScVal(opts.authority, { type: "address" }),
      bytesN32ToScVal(normalizeBytes32(opts.schemaId, "schemaId")),
    ],
  };
}

export function buildRevokeInstruction(opts: {
  revoker: string;
  uid: Uint8Array;
}): SorobanInvocationInstruction {
  return {
    contractId: ATTESTATION_ENGINE_V2_CONTRACT_ID,
    method: "revoke_attestation",
    args: [
      nativeToScVal(opts.revoker, { type: "address" }),
      bytesN32ToScVal(normalizeBytes32(opts.uid, "uid")),
    ],
  };
}

export async function invokeRegisterSchema(opts: {
  authority: string;
  schemaId: Uint8Array;
  name: string;
  fieldDefinitions: string;
  revocable: boolean;
  version?: number;
  resolver: string | null;
  schemaExpiryLedger: number;
  signTransaction: SignTxFn;
}): Promise<string> {
  const authorityKey = StrKey.decodeEd25519PublicKey(opts.authority);
  const args = [
    nativeToScVal(opts.authority, { type: "address" }),
    nativeToScVal(Buffer.from(authorityKey), { type: "bytes" }),
    nativeToScVal(Buffer.from(opts.schemaId), { type: "bytes" }),
    nativeToScVal(opts.name, { type: "string" }),
    nativeToScVal(opts.fieldDefinitions, { type: "string" }),
    nativeToScVal(opts.revocable, { type: "bool" }),
    nativeToScVal(opts.version ?? 1, { type: "u32" }),
    opts.resolver
      ? nativeToScVal(opts.resolver, { type: "address" })
      : nativeToScVal(null, { type: "address" }),
    nativeToScVal(opts.schemaExpiryLedger, { type: "u32" }),
  ];
  return invokeContractMethod({
    sourcePublicKey: opts.authority,
    contractId: SCHEMA_REGISTRY_CONTRACT_ID,
    method: "register_schema",
    args,
    signTransaction: opts.signTransaction,
  });
}

export async function invokeDeprecateSchema(opts: {
  authority: string;
  schemaId: Uint8Array;
  signTransaction: SignTxFn;
}): Promise<string> {
  try {
    const instruction = buildDeprecateSchemaInstruction(opts);
    return await invokeContractMethod({
      sourcePublicKey: opts.authority,
      contractId: instruction.contractId,
      method: instruction.method,
      args: instruction.args,
      signTransaction: opts.signTransaction,
    });
  } catch (error) {
    throw new Error(mapSchemaManagementError(error));
  }
}

export async function invokeAttest(opts: {
  issuer: string;
  schemaId: Uint8Array;
  stealthAddressHash: Uint8Array;
  data: Uint8Array;
  expirationLedger: number;
  refUid: Uint8Array;
  signTransaction: SignTxFn;
}): Promise<string> {
  return invokeContractMethod({
    sourcePublicKey: opts.issuer,
    contractId: ATTESTATION_ENGINE_V2_CONTRACT_ID,
    method: "attest",
    args: [
      nativeToScVal(opts.issuer, { type: "address" }),
      nativeToScVal(Buffer.from(opts.schemaId), { type: "bytes" }),
      nativeToScVal(Buffer.from(opts.stealthAddressHash), { type: "bytes" }),
      bytesToScVal(opts.data),
      nativeToScVal(opts.expirationLedger, { type: "u32" }),
      nativeToScVal(Buffer.from(opts.refUid), { type: "bytes" }),
    ],
    signTransaction: opts.signTransaction,
  });
}

export async function invokeRevokeAttestation(opts: {
  revoker: string;
  uid: Uint8Array;
  signTransaction: SignTxFn;
}): Promise<string> {
  try {
    const instruction = buildRevokeInstruction(opts);
    return await invokeContractMethod({
      sourcePublicKey: opts.revoker,
      contractId: instruction.contractId,
      method: instruction.method,
      args: instruction.args,
      signTransaction: opts.signTransaction,
    });
  } catch (error) {
    throw new Error(mapAttestationRevocationError(error));
  }
}

export async function invokeVerifyProofV2(opts: {
  caller: string;
  proofA: Uint8Array;
  proofB: Uint8Array;
  proofC: Uint8Array;
  merkleRoot: Uint8Array;
  attestationId: Uint8Array;
  externalNullifier: Uint8Array;
  nullifierHash: Uint8Array;
  signTransaction: SignTxFn;
}): Promise<string> {
  return invokeContractMethod({
    sourcePublicKey: opts.caller,
    contractId: GROTH16_VERIFIER_CONTRACT_ID,
    method: "verify_proof_v2",
    args: [
      nativeToScVal(Buffer.from(opts.proofA), { type: "bytes" }),
      nativeToScVal(Buffer.from(opts.proofB), { type: "bytes" }),
      nativeToScVal(Buffer.from(opts.proofC), { type: "bytes" }),
      nativeToScVal(
        {
          merkle_root: Buffer.from(opts.merkleRoot),
          attestation_id: Buffer.from(opts.attestationId),
          external_nullifier: Buffer.from(opts.externalNullifier),
          nullifier_hash: Buffer.from(opts.nullifierHash),
        },
        { type: "map" },
      ),
    ],
    signTransaction: opts.signTransaction,
  });
}

/** @deprecated */
export function buildRegisterSchemaInstruction(): never {
  throw new Error("Use invokeRegisterSchema() on Stellar");
}

/** @deprecated */
export function buildAttestInstruction(): never {
  throw new Error("Use invokeAttest() on Stellar");
}

/** @deprecated */
export function buildVerifyProofV2Instruction(): never {
  throw new Error("Use invokeVerifyProofV2() on Stellar");
}

/** @deprecated use announceStealthTransfer from contracts */
export { buildAnnounceInstruction } from "./contracts";

export async function invokeAddDelegate(opts: {
  authority: string;
  schemaId: Uint8Array;
  delegate: string;
  signTransaction: SignTxFn;
}): Promise<string> {
  if (!opts.delegate.startsWith("G") || opts.delegate.length !== 56) {
    throw new Error("Invalid delegate address: must be a Stellar G-address (56 chars)");
  }
  return invokeContractMethod({
    sourcePublicKey: opts.authority,
    contractId: SCHEMA_REGISTRY_CONTRACT_ID,
    method: "add_delegate",
    args: [
      nativeToScVal(opts.authority, { type: "address" }),
      nativeToScVal(Buffer.from(opts.schemaId), { type: "bytes" }),
      nativeToScVal(opts.delegate, { type: "address" }),
    ],
    signTransaction: opts.signTransaction,
  });
}

export async function invokeRemoveDelegate(opts: {
  authority: string;
  schemaId: Uint8Array;
  delegate: string;
  signTransaction: SignTxFn;
}): Promise<string> {
  return invokeContractMethod({
    sourcePublicKey: opts.authority,
    contractId: SCHEMA_REGISTRY_CONTRACT_ID,
    method: "remove_delegate",
    args: [
      nativeToScVal(opts.authority, { type: "address" }),
      nativeToScVal(Buffer.from(opts.schemaId), { type: "bytes" }),
      nativeToScVal(opts.delegate, { type: "address" }),
    ],
    signTransaction: opts.signTransaction,
  });
}

/** @deprecated */
export function buildAddDelegateInstruction(): never {
  throw new Error("Use invokeAddDelegate() on Stellar");
}

/** @deprecated */
export function buildRemoveDelegateInstruction(): never {
  throw new Error("Use invokeRemoveDelegate() on Stellar");
}

export { hexToBytes } from "./stealth";

export const SCHEMA_REGISTRY_PROGRAM_ID = SCHEMA_REGISTRY_CONTRACT_ID;
export const ATTESTATION_ENGINE_V2_PROGRAM_ID = ATTESTATION_ENGINE_V2_CONTRACT_ID;

export function hexPubkeyToBase58(hexOrAddr: string): string {
  return hexOrAddr.startsWith("G") ? hexOrAddr : hexOrAddr;
}

import { getNetwork } from "./chain";

function assertNotMainnet(fnName: string): void {
  if (getNetwork() === "mainnet") {
    throw new Error(
      `[Opaque] ${fnName} is not available on mainnet. Feature not yet implemented.`,
    );
  }
}

// =============================================================================
// Event parsing helpers (shared by fetchAllSchemas / fetchIssuedAttestations)
// =============================================================================

function evScValToNative(val: unknown): unknown {
  if (!val) return null;
  try {
    // SDK v13 returns pre-decoded xdr.ScVal objects
    return scValToNative(val as xdr.ScVal);
  } catch {
    // Fallback: base64 string
    if (typeof val === "string") {
      try {
        return scValToNative(xdr.ScVal.fromXDR(val, "base64"));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function evBufToU8(val: unknown): Uint8Array | null {
  if (val instanceof Buffer) return new Uint8Array(val);
  if (val instanceof Uint8Array) return val;
  return null;
}

function evU8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// =============================================================================
// On-chain attestation fetch (for ManageView — attestations the wallet issued)
// =============================================================================

export interface IssuedAttestationEvent {
  uid: Uint8Array;
  uidHex: string;
  schemaId: Uint8Array;
  schemaIdHex: string;
  stealthAddressHash: Uint8Array;
  createdAt: bigint;
  expirationSlot: bigint;
  revocationSlot: bigint;
  isRevoked: boolean;
  txHash: string;
}

export async function fetchIssuedAttestations(
  issuer: string,
  startLedger = 1,
): Promise<IssuedAttestationEvent[]> {
  if (getNetwork() === "mainnet") return [];
  try {
    const server = getSorobanServer();
    const eventsRes = await server.getEvents({
      startLedger: Math.max(1, startLedger),
      filters: [
        { type: "contract", contractIds: [ATTESTATION_ENGINE_V2_CONTRACT_ID] },
      ],
      limit: 500,
    });

    const attestMap = new Map<string, IssuedAttestationEvent>();
    const revokeMap = new Map<string, bigint>();

    for (const ev of eventsRes.events) {
      if (!ev.inSuccessfulContractCall) continue;
      const topics = ev.topic as unknown[];
      if (!topics?.length) continue;
      const evName = evScValToNative(topics[0]);
      if (typeof evName !== "string") continue;
      const data = evScValToNative(ev.value as unknown);

      if (evName === "AttestationCreated" || evName === "attest") {
        let uid: Uint8Array | null = null;
        let schemaId: Uint8Array | null = null;
        let evIssuer = "";
        let stealthAddressHash: Uint8Array | null = null;
        let expirationSlot = 0n;
        let createdAt = 0n;

        if (Array.isArray(data)) {
          // Tuple: [uid, schema_id, issuer, stealth_address_hash, expiration_slot, created_at]
          uid = evBufToU8(data[0]);
          schemaId = evBufToU8(data[1]);
          evIssuer = typeof data[2] === "string" ? data[2] : String(data[2] ?? "");
          stealthAddressHash = evBufToU8(data[3]);
          expirationSlot = typeof data[4] === "bigint" ? data[4] : 0n;
          createdAt = typeof data[5] === "bigint" ? data[5] : 0n;
        } else if (data && typeof data === "object") {
          const d = data as Record<string, unknown>;
          uid = evBufToU8(d.uid);
          schemaId = evBufToU8(d.schema_id);
          evIssuer = typeof d.issuer === "string" ? d.issuer : String(d.issuer ?? "");
          stealthAddressHash = evBufToU8(d.stealth_address_hash);
          expirationSlot = typeof d.expiration_slot === "bigint" ? d.expiration_slot : 0n;
          createdAt = typeof d.created_at === "bigint" ? d.created_at : 0n;
        }

        if (!uid || evIssuer !== issuer) continue;

        const uidHex = evU8ToHex(uid);
        attestMap.set(uidHex, {
          uid,
          uidHex,
          schemaId: schemaId ?? new Uint8Array(32),
          schemaIdHex: schemaId ? evU8ToHex(schemaId) : "",
          stealthAddressHash: stealthAddressHash ?? new Uint8Array(32),
          createdAt,
          expirationSlot,
          revocationSlot: 0n,
          isRevoked: false,
          txHash: ev.txHash ?? "",
        });
      } else if (evName === "AttestationRevoked" || evName === "revoke") {
        let uid: Uint8Array | null = null;
        let revocationSlot = 0n;

        if (Array.isArray(data)) {
          // Tuple: [uid, schema_id, issuer, revocation_slot]
          uid = evBufToU8(data[0]);
          revocationSlot = typeof data[3] === "bigint" ? data[3] : 0n;
        } else if (data && typeof data === "object") {
          const d = data as Record<string, unknown>;
          uid = evBufToU8(d.uid);
          revocationSlot = typeof d.revocation_slot === "bigint" ? d.revocation_slot : 0n;
        }

        if (!uid) continue;
        revokeMap.set(evU8ToHex(uid), revocationSlot > 0n ? revocationSlot : 1n);
      }
    }

    return Array.from(attestMap.values()).map((att) => {
      const revSlot = revokeMap.get(att.uidHex);
      return {
        ...att,
        isRevoked: revSlot !== undefined,
        revocationSlot: revSlot ?? 0n,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchAllSchemas(authority?: string): Promise<ParsedSchemaPDA[]> {
  if (getNetwork() === "mainnet") return [];
  try {
    const server = getSorobanServer();
    const eventsRes = await server.getEvents({
      startLedger: 1,
      filters: [
        { type: "contract", contractIds: [SCHEMA_REGISTRY_CONTRACT_ID] },
      ],
      limit: 500,
    });

    const schemaMap = new Map<string, ParsedSchemaPDA & { _idBytes: Uint8Array }>();
    const deprecatedIds = new Set<string>();
    const delegatesAdded = new Map<string, Set<string>>();
    const delegatesRemoved = new Map<string, Set<string>>();

    for (const ev of eventsRes.events) {
      if (!ev.inSuccessfulContractCall) continue;
      const topics = ev.topic as unknown[];
      if (!topics?.length) continue;
      const evName = evScValToNative(topics[0]);
      if (typeof evName !== "string") continue;
      const data = evScValToNative(ev.value as unknown);

      if (evName === "SchemaRegistered") {
        let schemaId: Uint8Array | null = null;
        let evAuthority = "";
        let name = "";
        let fieldDefinitions = "";
        let revocable = false;

        if (Array.isArray(data)) {
          // Tuple: [schema_id, authority, name, field_definitions, revocable]
          schemaId = evBufToU8(data[0]);
          evAuthority = typeof data[1] === "string" ? data[1] : String(data[1] ?? "");
          name = typeof data[2] === "string" ? data[2] : "";
          fieldDefinitions = typeof data[3] === "string" ? data[3] : "";
          revocable = Boolean(data[4]);
        } else if (data && typeof data === "object") {
          const d = data as Record<string, unknown>;
          schemaId = evBufToU8(d.schema_id);
          evAuthority = typeof d.authority === "string" ? d.authority : String(d.authority ?? "");
          name = typeof d.name === "string" ? d.name : "";
          fieldDefinitions = typeof d.field_definitions === "string" ? d.field_definitions : "";
          revocable = Boolean(d.revocable);
        }

        if (!schemaId) continue;
        if (authority && evAuthority !== authority) continue;

        const hex = evU8ToHex(schemaId);
        schemaMap.set(hex, {
          schemaId,
          _idBytes: schemaId,
          authority: evAuthority,
          revocable,
          name,
          fieldDefinitions,
          deprecated: false,
          delegates: [],
        });
      } else if (evName === "SchemaDeprecated") {
        let schemaId: Uint8Array | null = null;
        if (Array.isArray(data)) {
          schemaId = evBufToU8(data[0]);
        } else if (data && typeof data === "object") {
          schemaId = evBufToU8((data as Record<string, unknown>).schema_id);
        }
        if (schemaId) deprecatedIds.add(evU8ToHex(schemaId));
      } else if (evName === "DelegateAdded") {
        let schemaId: Uint8Array | null = null;
        let delegate = "";
        if (Array.isArray(data)) {
          schemaId = evBufToU8(data[0]);
          delegate = typeof data[1] === "string" ? data[1] : "";
        } else if (data && typeof data === "object") {
          const d = data as Record<string, unknown>;
          schemaId = evBufToU8(d.schema_id);
          delegate = typeof d.delegate === "string" ? d.delegate : "";
        }
        if (schemaId && delegate) {
          const hex = evU8ToHex(schemaId);
          if (!delegatesAdded.has(hex)) delegatesAdded.set(hex, new Set());
          delegatesAdded.get(hex)!.add(delegate);
        }
      } else if (evName === "DelegateRemoved") {
        let schemaId: Uint8Array | null = null;
        let delegate = "";
        if (Array.isArray(data)) {
          schemaId = evBufToU8(data[0]);
          delegate = typeof data[1] === "string" ? data[1] : "";
        } else if (data && typeof data === "object") {
          const d = data as Record<string, unknown>;
          schemaId = evBufToU8(d.schema_id);
          delegate = typeof d.delegate === "string" ? d.delegate : "";
        }
        if (schemaId && delegate) {
          const hex = evU8ToHex(schemaId);
          if (!delegatesRemoved.has(hex)) delegatesRemoved.set(hex, new Set());
          delegatesRemoved.get(hex)!.add(delegate);
        }
      }
    }

    return Array.from(schemaMap.values()).map((s) => {
      const hex = evU8ToHex(s._idBytes);
      const added = delegatesAdded.get(hex) ?? new Set<string>();
      const removed = delegatesRemoved.get(hex) ?? new Set<string>();
      const delegates = Array.from(added).filter((d) => !removed.has(d));
      return {
        schemaId: s._idBytes,
        authority: s.authority,
        revocable: s.revocable,
        name: s.name,
        fieldDefinitions: s.fieldDefinitions,
        deprecated: deprecatedIds.has(hex),
        delegates,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchAllAttestations(): Promise<unknown[]> {
  return [];
}

export interface ParsedSchemaPDA {
  schemaId: Uint8Array;
  authority: string;
  revocable: boolean;
  name: string;
  fieldDefinitions: string;
  deprecated: boolean;
  delegates?: string[];
}

/** A single entry from the reputation verifier root history. */
export interface RootHistoryEntry {
  /** 0x-prefixed hex root hash */
  root: string;
  /** Ledger sequence at which this root was committed */
  ledger: number;
  /** 0x-prefixed hex dataset hash */
  datasetHash: string;
}

function bufToHex(buf: unknown): string {
  if (Buffer.isBuffer(buf)) return "0x" + buf.toString("hex");
  if (buf instanceof Uint8Array) return "0x" + Buffer.from(buf).toString("hex");
  return String(buf);
}

/**
 * Fetches paginated root history entries from the reputation verifier contract.
 * Calls `get_root_entries(offset, limit)` which returns Vec<MerkleRootEntry>
 * (each entry has root, ledger, dataset_hash).
 *
 * Returns an empty array gracefully when there is no history yet.
 */
export async function fetchRootHistory(
  publicKey: string,
  contractId: string,
  offset: number,
  limit: number,
): Promise<RootHistoryEntry[]> {
  try {
    const server = getSorobanServer();
    const passphrase = getNetworkPassphrase();
    const fakeAccount = new Account(publicKey, "0");
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(fakeAccount, {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    })
      .addOperation(
        contract.call(
          "get_root_entries",
          nativeToScVal(offset, { type: "u32" }),
          nativeToScVal(limit, { type: "u32" }),
        ),
      )
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (!isSimulationSuccess(sim) || !sim.result) return [];

    const raw = scValToNative(sim.result.retval);
    if (!Array.isArray(raw)) return [];

    return raw
      .filter((e) => e && typeof e === "object")
      .map((e) => {
        const entry = e as Record<string, unknown>;
        return {
          root: bufToHex(entry["root"]),
          ledger: typeof entry["ledger"] === "number" ? entry["ledger"] : Number(entry["ledger"] ?? 0),
          datasetHash: bufToHex(entry["dataset_hash"]),
        };
      });
  } catch {
    return [];
  }
}
