import { describe, it, expect } from 'vitest';
import { COMMON_MODELS } from '../models';

describe('COMMON_MODELS', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(COMMON_MODELS)).toBe(true);
    expect(COMMON_MODELS.length).toBeGreaterThan(0);
    COMMON_MODELS.forEach(m => expect(typeof m).toBe('string'));
  });

  it('includes gpt-4o', () => {
    expect(COMMON_MODELS).toContain('gpt-4o');
  });

  it('includes gpt-4o-mini', () => {
    expect(COMMON_MODELS).toContain('gpt-4o-mini');
  });
});
