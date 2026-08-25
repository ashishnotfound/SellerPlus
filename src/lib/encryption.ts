import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_PREFIX = "spenc";
const ENVELOPE_VERSION = "1";

interface KeyringDocument {
  active: string;
  keys: Record<string, string>;
}

interface Keyring {
  active: string;
  keys: Map<string, Buffer>;
}

function decodeKey(value: string): Buffer {
  const key = /^[a-f0-9]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.byteLength !== 32) {
    throw new Error("SellerPlus encryption keys must decode to exactly 32 bytes.");
  }
  return key;
}

function getKeyring(): Keyring {
  const serialized = process.env.SELLERPLUS_ENCRYPTION_KEYS;
  if (serialized) {
    let document: KeyringDocument;
    try {
      document = JSON.parse(serialized) as KeyringDocument;
    } catch {
      throw new Error("SELLERPLUS_ENCRYPTION_KEYS must be valid JSON.");
    }
    if (!document.active || !document.keys?.[document.active]) {
      throw new Error("SELLERPLUS_ENCRYPTION_KEYS does not contain its active key version.");
    }
    return {
      active: document.active,
      keys: new Map(Object.entries(document.keys).map(([version, key]) => [version, decodeKey(key)])),
    };
  }

  // One-version compatibility path for installations that already configured
  // the original variable. There is deliberately no development fallback key.
  const legacy = process.env.AMAZON_CREDENTIALS_SECRET;
  if (legacy) {
    return { active: "legacy", keys: new Map([["legacy", decodeKey(legacy)]]) };
  }

  throw new Error(
    "Credential encryption is not configured. Set SELLERPLUS_ENCRYPTION_KEYS before storing integrations.",
  );
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/** Encrypts a secret into a versioned AES-256-GCM envelope. */
export function encryptToken(plaintext: string): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty credential.");

  const keyring = getKeyring();
  const key = keyring.keys.get(keyring.active);
  if (!key) throw new Error("The active encryption key is unavailable.");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [
    ENVELOPE_PREFIX,
    ENVELOPE_VERSION,
    keyring.active,
    encode(iv),
    encode(authenticationTag),
    encode(ciphertext),
  ].join(":");
}

/** Decrypts a current envelope and supports legacy iv:tag:ciphertext records. */
export function decryptToken(envelope: string): string {
  if (!envelope) throw new Error("The encrypted credential is empty.");

  const keyring = getKeyring();
  const parts = envelope.split(":");
  let keyVersion: string;
  let iv: Buffer;
  let authenticationTag: Buffer;
  let ciphertext: Buffer;

  if (parts.length === 6 && parts[0] === ENVELOPE_PREFIX && parts[1] === ENVELOPE_VERSION) {
    keyVersion = parts[2];
    iv = decode(parts[3]);
    authenticationTag = decode(parts[4]);
    ciphertext = decode(parts[5]);
  } else if (parts.length === 3) {
    keyVersion = "legacy";
    iv = Buffer.from(parts[0], "hex");
    authenticationTag = Buffer.from(parts[1], "hex");
    ciphertext = Buffer.from(parts[2], "hex");
  } else {
    throw new Error("Unsupported encrypted credential format.");
  }

  const key = keyring.keys.get(keyVersion);
  if (!key) throw new Error(`Encryption key version ${keyVersion} is unavailable.`);
  if (iv.byteLength !== 12 || authenticationTag.byteLength !== 16) {
    throw new Error("Encrypted credential metadata is invalid.");
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authenticationTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Credential decryption failed. Verify the configured key version.");
  }
}

export function credentialFingerprint(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16);
}
