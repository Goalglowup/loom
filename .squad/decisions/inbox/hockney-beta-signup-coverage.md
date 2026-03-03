# Beta Signup Coverage Gap — Email Validation Order

**Reporter:** Hockney  
**Date:** 2026-06-XX  
**Severity:** Low (UX issue, not a security/data integrity problem)

## Issue

The `POST /v1/beta/signup` endpoint validates email format BEFORE trimming whitespace, which means otherwise-valid emails with leading/trailing spaces are rejected with a 400 error.

**Current Implementation (src/routes/beta.ts:12-19):**

```typescript
if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  return reply.code(400).send({ error: 'Valid email is required' });
}

try {
  await query(
    `INSERT INTO beta_signups (email, name) VALUES ($1, $2)`,
    [email.toLowerCase().trim(), name ?? null],  // ← trim happens here
  );
```

**Problem:**
- Input: `"  user@example.com  "` → **400 error** (rejected by regex)
- Input: `"user@example.com"` → **201 registered** (stored as `user@example.com`)

The regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` requires no whitespace at the start or end (`^` and `$` anchors). The `.trim()` call on line 19 is unreachable for inputs with whitespace because they fail validation first.

## Expected Behavior

Emails with leading/trailing whitespace should be **accepted** (trimmed and stored normalized):

```typescript
const trimmedEmail = email.toLowerCase().trim();

if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
  return reply.code(400).send({ error: 'Valid email is required' });
}

await query(
  `INSERT INTO beta_signups (email, name) VALUES ($1, $2)`,
  [trimmedEmail, name ?? null],
);
```

## Impact

**Low:** This is a public beta signup form. Most users will not accidentally add whitespace, but copy/paste from some sources (e.g., email clients, spreadsheets) might introduce it.

**Workaround:** Frontend can `.trim()` the email before submission.

## Tests

The current behavior is **documented** in `tests/beta-routes.test.ts`:

```typescript
it('returns 400 for email with leading/trailing whitespace', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/beta/signup',
    payload: { email: '  user@example.com  ' },
  });

  expect(res.statusCode).toBe(400);
  expect(body.error).toBe('Valid email is required');
});
```

If the implementation is fixed to trim before validation, this test should be updated to expect **201** instead of 400.

## Recommendation

**Option 1 (Fix backend):** Trim email before validation (1-line change).  
**Option 2 (Fix frontend):** Add `.trim()` in the signup form before submission.  
**Option 3 (Do nothing):** Accept current behavior as intentional strict validation.

My recommendation: **Option 1** — backend should be tolerant of whitespace (it's already calling `.trim()`, just in the wrong order).
