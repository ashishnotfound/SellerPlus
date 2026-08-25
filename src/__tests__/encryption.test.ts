import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { credentialFingerprint, decryptToken, encryptToken } from "@/lib/encryption";

const originalKeyring = process.env.SELLERPLUS_ENCRYPTION_KEYS;
const originalLegacyKey = process.env.AMAZON_CREDENTIALS_SECRET;

describe("credential encryption", () => {
  beforeEach(() => {
    process.env.SELLERPLUS_ENCRYPTION_KEYS = JSON.stringify({
      active: "2026-08",
      keys: {
        "2026-07": "11".repeat(32),
        "2026-08": "22".repeat(32),
      },
    });
    delete process.env.AMAZON_CREDENTIALS_SECRET;
  });

  afterEach(() => {
    if (originalKeyring === undefined) delete process.env.SELLERPLUS_ENCRYPTION_KEYS;
    else process.env.SELLERPLUS_ENCRYPTION_KEYS = originalKeyring;
    if (originalLegacyKey === undefined) delete process.env.AMAZON_CREDENTIALS_SECRET;
    else process.env.AMAZON_CREDENTIALS_SECRET = originalLegacyKey;
  });

  it("round-trips a credential using a versioned AES-GCM envelope", () => {
    const encrypted = encryptToken("amazon-refresh-token");

    expect(encrypted).toMatch(/^spenc:1:2026-08:/);
    expect(encrypted).not.toContain("amazon-refresh-token");
    expect(decryptToken(encrypted)).toBe("amazon-refresh-token");
  });

  it("detects authentication-tag or ciphertext tampering", () => {
    const encrypted = encryptToken("sensitive-value");
    const tampered = encrypted.slice(0, -1) + (encrypted.endsWith("A") ? "B" : "A");

    expect(() => decryptToken(tampered)).toThrow("Credential decryption failed");
  });

  it("fails closed when no encryption key is configured", () => {
    delete process.env.SELLERPLUS_ENCRYPTION_KEYS;
    delete process.env.AMAZON_CREDENTIALS_SECRET;

    expect(() => encryptToken("secret")).toThrow("Credential encryption is not configured");
  });

  it("creates a stable non-reversible display fingerprint", () => {
    const first = credentialFingerprint("same-secret");
    const second = credentialFingerprint("same-secret");

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{16}$/);
    expect(first).not.toContain("same-secret");
  });
});
