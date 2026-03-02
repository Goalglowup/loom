/**
 * Generate a URL-safe org slug from a tenant name.
 * Rules: lowercase, replace spaces and special chars with hyphens,
 * collapse multiple hyphens, trim hyphens from ends.
 * Max 50 chars.
 * Examples: "Acme Corp" → "acme-corp", "My App (v2)" → "my-app-v2"
 */
export function generateOrgSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Validate an org slug.
 * Must be: 3-50 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens.
 */
export function validateOrgSlug(slug: string): { valid: boolean; error?: string } {
  if (slug.length < 3) return { valid: false, error: 'Slug must be at least 3 characters' };
  if (slug.length > 50) return { valid: false, error: 'Slug must be 50 characters or less' };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return { valid: false, error: 'Slug must be lowercase alphanumeric with hyphens only (no leading/trailing hyphens)' };
  }
  return { valid: true };
}
