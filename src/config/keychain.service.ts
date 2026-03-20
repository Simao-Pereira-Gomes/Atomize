import { AuthError } from "@utils/errors";
import type keytar from "keytar";
import type { EncryptedToken } from "./connections.interface";
import { decryptWithKeyfile, encryptWithKeyfile } from "./keyfile.service";

type KeytarModule = typeof keytar;

let _keytar: KeytarModule | null | undefined;

async function getKeytar(): Promise<KeytarModule | null> {
  if (_keytar !== undefined) return _keytar;
  try {
    _keytar = (await import("keytar")) as KeytarModule;
    return _keytar;
  } catch {
    _keytar = null;
    return null;
  }
}

export async function keychainAvailable(): Promise<boolean> {
  return (await getKeytar()) !== null;
}

const SERVICE_NAME = "atomize";

export async function storeToken(
  profileName: string,
  token: string,
  { allowKeyfileStorage = false }: { allowKeyfileStorage?: boolean } = {},
): Promise<EncryptedToken> {
  const kt = await getKeytar();
  if (kt) {
    try {
      await kt.setPassword(SERVICE_NAME, profileName, token);
      return { strategy: "keychain" };
    } catch {
      // Keychain write failed — fall through to keyfile if explicitly allowed.
    }
  }
  if (!allowKeyfileStorage) {
    throw new AuthError(
      "System keychain is unavailable. Re-run with --insecure-storage to use the insecure local file fallback instead.",
    );
  }
  const encrypted = await encryptWithKeyfile(token);
  return { strategy: "keyfile", ...encrypted };
}

export async function retrieveToken(
  profileName: string,
  token: EncryptedToken,
): Promise<string> {
  if (token.strategy === "keychain") {
    const kt = await getKeytar();
    if (!kt)
      throw new AuthError(
        `keytar unavailable — cannot retrieve token for profile "${profileName}"`,
      );
    const stored = await kt.getPassword(SERVICE_NAME, profileName);
    if (!stored)
      throw new AuthError(
        `No token found in keychain for profile "${profileName}"`,
      );
    return stored;
  }
  return decryptWithKeyfile(token.iv, token.authTag, token.ciphertext);
}

export async function deleteToken(
  profileName: string,
  token: EncryptedToken,
): Promise<void> {
  if (token.strategy === "keychain") {
    const kt = await getKeytar();
    if (kt) {
      try {
        await kt.deletePassword(SERVICE_NAME, profileName);
      } catch {
        // Ignore keychain cleanup errors so token rotation/removal can continue.
      }
    }
  }
}
