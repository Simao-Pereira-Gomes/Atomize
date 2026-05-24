import { randomUUID } from "node:crypto";
import { logger } from "@config/logger";
import { AuthError, getErrorMessage } from "@utils/errors";
import type keytar from "keytar";
import type { EncryptedToken } from "./connections.interface";
import { decryptWithKeyfile, encryptWithKeyfile } from "./keyfile.service";

type KeytarModule = typeof keytar;
type KeytarProbe = Pick<KeytarModule, "setPassword" | "getPassword" | "deletePassword">;

let _keytar: KeytarModule | null | undefined;

async function getKeytar(): Promise<KeytarModule | null> {
  if (_keytar !== undefined) return _keytar;
  try {
    _keytar = normalizeKeytarModule(await import("keytar"));
    return _keytar;
  } catch (error) {
    logger.debug(`Failed to load keytar: ${getErrorMessage(error)}`);
    _keytar = null;
    return null;
  }
}

const SERVICE_NAME = "atomize";

export async function probeKeychainAccess(
  keytarModule: KeytarProbe,
  probeId: string,
  onError: (error: unknown) => void = () => {},
): Promise<boolean> {
  const service = `${SERVICE_NAME}-probe`;
  const account = `atomize-probe-${probeId}`;
  const secret = `atomize-probe-secret-${probeId}`;

  try {
    await keytarModule.setPassword(service, account, secret);
    const stored = await keytarModule.getPassword(service, account);
    await keytarModule.deletePassword(service, account);
    return stored === secret;
  } catch (error) {
    onError(error);
    try {
      await keytarModule.deletePassword(service, account);
    } catch {
      // Best-effort cleanup only.
    }
    return false;
  }
}

export async function keychainAvailable(): Promise<boolean> {
  const kt = await getKeytar();
  if (!kt) {
    return false;
  }

  return probeKeychainAccess(kt, randomUUID(), (error) => {
    logger.debug(`Keychain probe failed: ${getErrorMessage(error)}`);
  });
}

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
    } catch (error) {
      logger.debug(`Failed to store token in keychain: ${getErrorMessage(error)}`);
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
      } catch (error) {
        logger.debug(`Failed to delete token from keychain: ${getErrorMessage(error)}`);
        // Ignore keychain cleanup errors so token rotation/removal can continue.
      }
    }
  }
}

export function normalizeKeytarModule<T extends object>(imported: T | { default: T }): T {
  return "default" in imported ? imported.default : imported;
}
