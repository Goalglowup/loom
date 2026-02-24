import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptTraceBody, decryptTraceBody } from '../src/encryption.js';

describe('encryption', () => {
  const originalEnv = process.env.ENCRYPTION_MASTER_KEY;
  
  // Generate a test master key (32 bytes = 64 hex chars)
  const testMasterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = testMasterKey;
  });
  
  afterEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = originalEnv;
  });
  
  describe('encryptTraceBody', () => {
    it('should encrypt a trace body and return ciphertext and IV', () => {
      const tenantId = 'tenant-123';
      const body = JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] });
      
      const result = encryptTraceBody(tenantId, body);
      
      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
      expect(typeof result.ciphertext).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(result.ciphertext).not.toBe(body);
      expect(result.iv.length).toBe(24); // 12 bytes = 24 hex chars
    });
    
    it('should generate unique IVs for each encryption', () => {
      const tenantId = 'tenant-123';
      const body = 'same body';
      
      const result1 = encryptTraceBody(tenantId, body);
      const result2 = encryptTraceBody(tenantId, body);
      
      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.ciphertext).not.toBe(result2.ciphertext);
    });
    
    it('should produce different ciphertext for different tenants', () => {
      const body = 'sensitive data';
      
      const result1 = encryptTraceBody('tenant-1', body);
      const result2 = encryptTraceBody('tenant-2', body);
      
      // Different tenant keys should produce different ciphertext
      expect(result1.ciphertext).not.toBe(result2.ciphertext);
    });
    
    it('should handle empty strings', () => {
      const result = encryptTraceBody('tenant-123', '');
      
      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
    });
    
    it('should handle large payloads', () => {
      const largeBody = JSON.stringify({ data: 'x'.repeat(100000) });
      
      const result = encryptTraceBody('tenant-123', largeBody);
      
      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
      expect(result.ciphertext.length).toBeGreaterThan(0);
    });
    
    it('should throw if ENCRYPTION_MASTER_KEY is not set', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      
      expect(() => encryptTraceBody('tenant-123', 'data')).toThrow('ENCRYPTION_MASTER_KEY environment variable not set');
    });
    
    it('should throw if ENCRYPTION_MASTER_KEY is wrong length', () => {
      process.env.ENCRYPTION_MASTER_KEY = 'tooshort';
      
      expect(() => encryptTraceBody('tenant-123', 'data')).toThrow('ENCRYPTION_MASTER_KEY must be 32 bytes');
    });
  });
  
  describe('decryptTraceBody', () => {
    it('should decrypt encrypted trace body', () => {
      const tenantId = 'tenant-123';
      const originalBody = JSON.stringify({ model: 'gpt-4', prompt: 'test' });
      
      const { ciphertext, iv } = encryptTraceBody(tenantId, originalBody);
      const decrypted = decryptTraceBody(tenantId, ciphertext, iv);
      
      expect(decrypted).toBe(originalBody);
    });
    
    it('should fail if wrong tenant ID is used', () => {
      const originalBody = 'secret data';
      const { ciphertext, iv } = encryptTraceBody('tenant-1', originalBody);
      
      // Different tenant = different key = decryption failure
      expect(() => decryptTraceBody('tenant-2', ciphertext, iv)).toThrow();
    });
    
    it('should fail if ciphertext is tampered', () => {
      const tenantId = 'tenant-123';
      const originalBody = 'original data';
      const { ciphertext, iv } = encryptTraceBody(tenantId, originalBody);
      
      // Tamper with ciphertext
      const tamperedCiphertext = ciphertext.slice(0, -4) + '0000';
      
      expect(() => decryptTraceBody(tenantId, tamperedCiphertext, iv)).toThrow();
    });
    
    it('should fail if IV is wrong', () => {
      const tenantId = 'tenant-123';
      const originalBody = 'original data';
      const { ciphertext } = encryptTraceBody(tenantId, originalBody);
      
      const wrongIv = '000000000000000000000000'; // 12 bytes of zeros
      
      expect(() => decryptTraceBody(tenantId, ciphertext, wrongIv)).toThrow();
    });
    
    it('should handle empty encrypted strings', () => {
      const tenantId = 'tenant-123';
      const { ciphertext, iv } = encryptTraceBody(tenantId, '');
      const decrypted = decryptTraceBody(tenantId, ciphertext, iv);
      
      expect(decrypted).toBe('');
    });
    
    it('should handle large encrypted payloads', () => {
      const tenantId = 'tenant-123';
      const largeBody = JSON.stringify({ data: 'x'.repeat(100000) });
      
      const { ciphertext, iv } = encryptTraceBody(tenantId, largeBody);
      const decrypted = decryptTraceBody(tenantId, ciphertext, iv);
      
      expect(decrypted).toBe(largeBody);
    });
  });
  
  describe('encryption round-trip', () => {
    it('should handle typical trace request body', () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const requestBody = JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' }
        ],
        temperature: 0.7,
        max_tokens: 100
      });
      
      const { ciphertext, iv } = encryptTraceBody(tenantId, requestBody);
      const decrypted = decryptTraceBody(tenantId, ciphertext, iv);
      
      expect(decrypted).toBe(requestBody);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(requestBody));
    });
    
    it('should handle typical trace response body', () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const responseBody = JSON.stringify({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Paris is the capital of France.' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 }
      });
      
      const { ciphertext, iv } = encryptTraceBody(tenantId, responseBody);
      const decrypted = decryptTraceBody(tenantId, ciphertext, iv);
      
      expect(decrypted).toBe(responseBody);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(responseBody));
    });
    
    it('should maintain tenant isolation', () => {
      const tenant1 = '550e8400-e29b-41d4-a716-446655440001';
      const tenant2 = '550e8400-e29b-41d4-a716-446655440002';
      const secretData = 'tenant 1 secret data';
      
      const { ciphertext, iv } = encryptTraceBody(tenant1, secretData);
      
      // Tenant 1 can decrypt
      expect(decryptTraceBody(tenant1, ciphertext, iv)).toBe(secretData);
      
      // Tenant 2 cannot decrypt (different key)
      expect(() => decryptTraceBody(tenant2, ciphertext, iv)).toThrow();
    });
  });
});
