import crypto from "crypto";

// For local development, fallback to a hardcoded 32-byte hex key if the env var is missing.
// In production, THIS MUST BE SET IN VERCEL.
const ENCRYPTION_KEY = process.env.AMAZON_CREDENTIALS_SECRET 
  || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // 32 bytes hex
const ALGORITHM = "aes-256-gcm";

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns the format `iv:authTag:encryptedData` (all hex).
 */
export function encryptToken(text: string): string {
  if (!text) return "";
  
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string (format `iv:authTag:encryptedData`).
 * Returns the plaintext string.
 */
export function decryptToken(encryptedText: string): string {
  if (!encryptedText) return "";
  
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted token format");
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = Buffer.from(ENCRYPTION_KEY, "hex");
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    console.error("[Encryption] Failed to decrypt token", error);
    throw new Error("Failed to decrypt sensitive token. Check encryption key.");
  }
}
