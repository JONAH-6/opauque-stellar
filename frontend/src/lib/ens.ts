/**
 * Stellar SEP-2 federation / address resolution.
 *
 * Resolves human-readable identifiers (*domain.com) to Stellar addresses
 * via the Stellar Federation Protocol (SEP-2).
 * Falls back cleanly when federation is unreachable or the name is unknown.
 */

import { getNetwork } from "./chain";

const FEDERATION_SERVERS: Record<string, string | undefined> = {
  mainnet: "https://federation.stellar.org",
  testnet: undefined,
  futurenet: undefined,
  local: undefined,
};

export const STELLAR_ADDRESS_RE = /^[a-z0-9_-]+(?:\*[a-z0-9_.-]+)?$/i;
export const FEDERATION_LOOKUP_RE = /^[a-z0-9_-]+\*[a-z0-9_.-]+$/i;

export function isStellarAddress(input: string): boolean {
  return STELLAR_ADDRESS_RE.test(input.trim());
}

export function isFederationIdentifier(input: string): boolean {
  return FEDERATION_LOOKUP_RE.test(input.trim());
}

export function getFederationServer(input: string): string | null {
  const match = input.trim().match(FEDERATION_LOOKUP_RE);
  if (!match) return null;
  const domain = input.split("*")[1];
  return `https://federation.${domain}`;
}

export async function resolveDomain(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (!isFederationIdentifier(trimmed)) {
    return null;
  }

  const serverUrl = getFederationServer(trimmed) ?? FEDERATION_SERVERS[getNetwork()];
  if (!serverUrl) return null;

  try {
    const url = new URL(serverUrl);
    url.searchParams.set("type", "name");
    url.searchParams.set("q", trimmed);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const body = await res.json() as { account_id?: string };
    if (body.account_id && body.account_id.startsWith("G")) {
      return body.account_id;
    }
    return null;
  } catch {
    return null;
  }
}

export function isDomainName(input: string): boolean {
  return isFederationIdentifier(input);
}

export const isEnsName = isDomainName;

export const resolveEnsToAddress = resolveDomain;
