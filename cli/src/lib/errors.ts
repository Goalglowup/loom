/**
 * Parse a gateway error response and print a friendly message.
 * Falls back to the raw body if the error format is unrecognized.
 */
export function handleApiError(status: number, body: string): never {
  let parsed: { error?: string; message?: string } | undefined;
  try {
    parsed = JSON.parse(body);
  } catch {
    // not JSON
  }

  const message = parsed?.error ?? parsed?.message ?? body;

  if (status === 401) {
    if (/orgSlug/i.test(message)) {
      console.error('Error: Your session token is stale. Run `arachne login` to re-authenticate.');
    } else if (/expired/i.test(message)) {
      console.error('Error: Your session has expired. Run `arachne login` to re-authenticate.');
    } else {
      console.error(`Error: Authentication failed (${message}). Run \`arachne login\` to re-authenticate.`);
    }
  } else if (status === 403) {
    if (/orgSlug/i.test(message)) {
      console.error('Error: Your session token is stale. Run `arachne login` to re-authenticate.');
    } else if (/insufficient/i.test(message)) {
      console.error('Error: You do not have permission for this operation. Check your role with your tenant owner.');
    } else {
      console.error(`Error: Forbidden (${message}).`);
    }
  } else if (status === 404) {
    console.error(`Error: Not found (${message}).`);
  } else if (status >= 500) {
    console.error(`Error: The gateway returned an internal error. Please try again or check the server logs.`);
  } else {
    console.error(`Error: ${status} ${message}`);
  }

  process.exit(1);
}
