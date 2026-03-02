/**
 * Unit tests for src/utils/slug.ts
 * Covers: generateOrgSlug, validateOrgSlug
 */

import { describe, it, expect } from 'vitest';
import { generateOrgSlug, validateOrgSlug } from '../src/utils/slug.js';

// ── generateOrgSlug ───────────────────────────────────────────────────────────

describe('generateOrgSlug', () => {
  it('lowercases and hyphenates a simple company name', () => {
    expect(generateOrgSlug('My Company')).toBe('my-company');
  });

  it('trims leading and trailing whitespace before slugifying', () => {
    expect(generateOrgSlug('  Spaces & Symbols!  ')).toBe('spaces-symbols');
  });

  it('collapses multiple consecutive special chars into a single hyphen', () => {
    expect(generateOrgSlug('Acme   Corp!!!')).toBe('acme-corp');
  });

  it('removes leading and trailing hyphens', () => {
    expect(generateOrgSlug('--Leading Hyphens--')).toBe('leading-hyphens');
  });

  it('handles parentheses and version strings', () => {
    expect(generateOrgSlug('My App (v2)')).toBe('my-app-v2');
  });

  it('handles already-slug-like input unchanged', () => {
    expect(generateOrgSlug('acme-corp')).toBe('acme-corp');
  });

  it('truncates to 50 characters', () => {
    const longName = 'A'.repeat(60);
    expect(generateOrgSlug(longName)).toHaveLength(50);
  });

  it('handles ampersand and special symbols', () => {
    expect(generateOrgSlug('Smith & Jones, LLC.')).toBe('smith-jones-llc');
  });
});

// ── validateOrgSlug ───────────────────────────────────────────────────────────

describe('validateOrgSlug', () => {
  it('returns valid: true for a well-formed slug', () => {
    expect(validateOrgSlug('valid-slug').valid).toBe(true);
  });

  it('returns valid: true for an all-numeric slug', () => {
    expect(validateOrgSlug('abc123').valid).toBe(true);
  });

  it('returns valid: false for UPPERCASE slug', () => {
    expect(validateOrgSlug('UPPERCASE').valid).toBe(false);
  });

  it('returns valid: false for slug with spaces', () => {
    expect(validateOrgSlug('has spaces').valid).toBe(false);
  });

  it('returns valid: false for empty string', () => {
    expect(validateOrgSlug('').valid).toBe(false);
  });

  it('returns valid: false for slug shorter than 3 chars', () => {
    expect(validateOrgSlug('ab').valid).toBe(false);
  });

  it('returns valid: false for slug longer than 50 chars', () => {
    expect(validateOrgSlug('a'.repeat(51)).valid).toBe(false);
  });

  it('returns valid: false for slug with leading hyphen', () => {
    expect(validateOrgSlug('-leading').valid).toBe(false);
  });

  it('returns valid: false for slug with trailing hyphen', () => {
    expect(validateOrgSlug('trailing-').valid).toBe(false);
  });

  it('returns valid: false for slug with underscore', () => {
    expect(validateOrgSlug('has_underscore').valid).toBe(false);
  });

  it('includes an error message when invalid', () => {
    const result = validateOrgSlug('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns no error property when valid', () => {
    const result = validateOrgSlug('good-slug');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts exactly 3 character slug', () => {
    expect(validateOrgSlug('abc').valid).toBe(true);
  });

  it('accepts exactly 50 character slug', () => {
    expect(validateOrgSlug('a'.repeat(50)).valid).toBe(true);
  });
});
