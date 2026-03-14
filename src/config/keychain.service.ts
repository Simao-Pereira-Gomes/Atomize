import { AuthError } from "@utils/errors";
import type keytar from "keytar";
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
): Promise<{
  strategy: "keychain" | "keyfile";
  iv?: string;
  authTag?: string;
  ciphertext?: string;
}> {
  const kt = await getKeytar();
  if (kt) {
    await kt.setPassword(SERVICE_NAME, profileName, token);
    return { strategy: "keychain" };
  }
  const encrypted = await encryptWithKeyfile(token);
  return { strategy: "keyfile", ...encrypted };
}

export async function retrieveToken(
  profileName: string,
  strategy: "keychain" | "keyfile",
  iv?: string,
  authTag?: string,
  ciphertext?: string,
): Promise<string> {
  if (strategy === "keychain") {
    const kt = await getKeytar();
    if (!kt)
      throw new AuthError(
        `keytar unavailable — cannot retrieve token for profile "${profileName}"`,
      );
    const token = await kt.getPassword(SERVICE_NAME, profileName);
    if (!token)
      throw new AuthError(
        `No token found in keychain for profile "${profileName}"`,
      );
    return token;
  }
  if (!iv || !authTag || !ciphertext) {
    throw new AuthError(
      `Encrypted token data missing for profile "${profileName}"`,
    );
  }
  return decryptWithKeyfile(iv, authTag, ciphertext);
}

export async function deleteToken(
  profileName: string,
  strategy: "keychain" | "keyfile",
): Promise<void> {
  if (strategy === "keychain") {
    const kt = await getKeytar();
    if (kt) await kt.deletePassword(SERVICE_NAME, profileName);
  }
}
