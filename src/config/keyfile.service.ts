import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const ATOMIZE_DIR = join(homedir(), ".atomize");
const KEY_FILE_PATH = join(ATOMIZE_DIR, ".keyfile");
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;

async function ensureKeyFile(): Promise<Buffer> {
  try {
    const keyHex = await readFile(KEY_FILE_PATH, "utf-8");
    return Buffer.from(keyHex.trim(), "hex");
  } catch {
    await mkdir(ATOMIZE_DIR, { recursive: true });
    const key = randomBytes(KEY_BYTES);
    await writeFile(KEY_FILE_PATH, key.toString("hex"), {
      encoding: "utf-8",
      mode: 0o600,
    });
    await chmod(KEY_FILE_PATH, 0o600);
    return key;
  }
}

export async function encryptWithKeyfile(
  plaintext: string,
): Promise<{ iv: string; authTag: string; ciphertext: string }> {
  const key = await ensureKeyFile();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

export async function decryptWithKeyfile(
  iv: string,
  authTag: string,
  ciphertext: string,
): Promise<string> {
  const key = await ensureKeyFile();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}
