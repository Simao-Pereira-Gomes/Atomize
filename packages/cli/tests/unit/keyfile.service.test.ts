import { describe, expect, test } from "bun:test";
import {
  decryptWithKeyfile,
  encryptWithKeyfile,
} from "@config/keyfile.service";

describe("keyfile.service", () => {
  describe("encryptWithKeyfile", () => {
    test("should return iv, authTag, and ciphertext as non-empty strings", async () => {
      const result = await encryptWithKeyfile("my-secret-token");

      expect(typeof result.iv).toBe("string");
      expect(result.iv.length).toBeGreaterThan(0);

      expect(typeof result.authTag).toBe("string");
      expect(result.authTag.length).toBeGreaterThan(0);

      expect(typeof result.ciphertext).toBe("string");
      expect(result.ciphertext.length).toBeGreaterThan(0);
    });

    test("should produce different ciphertexts for different plaintexts", async () => {
      const result1 = await encryptWithKeyfile("token-one");
      const result2 = await encryptWithKeyfile("token-two");

      expect(result1.ciphertext).not.toBe(result2.ciphertext);
    });

    test("should produce different IVs on each call (nonce uniqueness)", async () => {
      const result1 = await encryptWithKeyfile("same-token");
      const result2 = await encryptWithKeyfile("same-token");

      expect(result1.iv).not.toBe(result2.iv);
    });
  });

  describe("decryptWithKeyfile", () => {
    test("round-trip: decrypt(encrypt(plaintext)) === plaintext", async () => {
      const plaintext = "super-secret-pat-token-12345";
      const { iv, authTag, ciphertext } = await encryptWithKeyfile(plaintext);
      const decrypted = await decryptWithKeyfile(iv, authTag, ciphertext);

      expect(decrypted).toBe(plaintext);
    });

    test("round-trip works for empty string", async () => {
      const plaintext = "";
      const { iv, authTag, ciphertext } = await encryptWithKeyfile(plaintext);
      const decrypted = await decryptWithKeyfile(iv, authTag, ciphertext);

      expect(decrypted).toBe(plaintext);
    });

    test("round-trip works for unicode content", async () => {
      const plaintext = "token-with-unicode-🔑-chars";
      const { iv, authTag, ciphertext } = await encryptWithKeyfile(plaintext);
      const decrypted = await decryptWithKeyfile(iv, authTag, ciphertext);

      expect(decrypted).toBe(plaintext);
    });

    test("tampering with ciphertext throws on decrypt", async () => {
      const plaintext = "valid-token";
      const { iv, authTag, ciphertext } = await encryptWithKeyfile(plaintext);

      // Flip the last two hex characters to tamper with the ciphertext
      const tampered =
        ciphertext.slice(0, -2) + (ciphertext.slice(-2) === "ff" ? "00" : "ff");

      expect(decryptWithKeyfile(iv, authTag, tampered)).rejects.toThrow();
    });

    test("tampering with authTag throws on decrypt", async () => {
      const plaintext = "valid-token";
      const { iv, authTag, ciphertext } = await encryptWithKeyfile(plaintext);

      const tamperedTag =
        authTag.slice(0, -2) + (authTag.slice(-2) === "ff" ? "00" : "ff");

      expect(decryptWithKeyfile(iv, tamperedTag, ciphertext)).rejects.toThrow();
    });
  });
});
