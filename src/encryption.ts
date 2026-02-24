import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Trace Encryption Module
 * 
 * Implements AES-256-GCM encryption for tenant trace data (request/response bodies).
 * 
 * Key Derivation Strategy:
 * - Master key from environment variable ENCRYPTION_MASTER_KEY (32 bytes hex)
 * - Per-tenant keys derived via HMAC-SHA256(masterKey, tenantId)
 * - Ensures tenant isolation: compromise of one tenant key doesn't expose others
 * - Phase 1: Application-level key management
 * - Phase 2: Migrate to external KMS (AWS KMS, GCP KMS, etc.)
 * 
 * Security Properties:
 * - AES-256-GCM: Authenticated encryption (confidentiality + integrity)
 * - Unique IV per encryption operation (required for GCM security)
 * - IV stored alongside ciphertext (standard practice, IV is not secret)
 * - 16-byte authentication tag appended to ciphertext
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits (recommended for GCM)
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get the master encryption key from environment.
 * Throws if not configured or invalid format.
 */
function getMasterKey(): Buffer {
  const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY;
  
  if (!masterKeyHex) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable not set');
  }
  
  const masterKey = Buffer.from(masterKeyHex, 'hex');
  
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_MASTER_KEY must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars), got ${masterKey.length} bytes`);
  }
  
  return masterKey;
}

/**
 * Derive a per-tenant encryption key from the master key.
 * Uses HMAC-SHA256 for key derivation (simple, secure, deterministic).
 * 
 * @param tenantId - Tenant UUID
 * @returns 32-byte encryption key
 */
function deriveTenantKey(tenantId: string): Buffer {
  const masterKey = getMasterKey();
  
  // HMAC-SHA256 produces 32 bytes, perfect for AES-256
  const tenantKey = createHash('sha256')
    .update(masterKey)
    .update(tenantId)
    .digest();
  
  return tenantKey;
}

/**
 * Encrypt trace body data for a specific tenant.
 * 
 * @param tenantId - Tenant UUID
 * @param body - Plain text trace body (JSON stringified request/response)
 * @returns Object with encrypted ciphertext (hex) and IV (hex)
 */
export function encryptTraceBody(tenantId: string, body: string): { ciphertext: string; iv: string } {
  const key = deriveTenantKey(tenantId);
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let ciphertext = cipher.update(body, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  
  // Append authentication tag (GCM provides this)
  const authTag = cipher.getAuthTag();
  ciphertext += authTag.toString('hex');
  
  return {
    ciphertext,
    iv: iv.toString('hex')
  };
}

/**
 * Decrypt trace body data for a specific tenant.
 * 
 * @param tenantId - Tenant UUID
 * @param encryptedBody - Encrypted ciphertext (hex) including auth tag
 * @param iv - Initialization vector (hex)
 * @returns Decrypted plain text
 * @throws Error if decryption fails (wrong key, corrupted data, tampered ciphertext)
 */
export function decryptTraceBody(tenantId: string, encryptedBody: string, iv: string): string {
  const key = deriveTenantKey(tenantId);
  const ivBuffer = Buffer.from(iv, 'hex');
  
  // Extract auth tag from end of ciphertext
  const authTagStart = encryptedBody.length - (AUTH_TAG_LENGTH * 2); // hex chars
  const ciphertext = encryptedBody.slice(0, authTagStart);
  const authTag = Buffer.from(encryptedBody.slice(authTagStart), 'hex');
  
  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  
  return plaintext;
}
