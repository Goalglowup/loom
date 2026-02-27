/**
 * Agent context application and MCP round-trip handling for the Loom gateway.
 *
 * Called from the /v1/chat/completions handler to:
 *   1. Inject agent system prompt and skills into the outgoing request body
 *      according to the agent's merge_policies.
 *   2. Detect MCP tool calls in a provider response and perform one round-trip
 *      to the MCP server(s), then re-send to the provider.
 */
import type { TenantContext } from './auth.js';
import type { BaseProvider } from './providers/base.js';
import type { ProxyRequest } from './types/openai.js';

// ---------------------------------------------------------------------------
// applyAgentToRequest
// ---------------------------------------------------------------------------

/**
 * Return a new request body with the agent's system prompt and skills applied
 * according to `tenant.mergePolicies`.  The original body is never mutated.
 */
export function applyAgentToRequest(body: any, tenant: TenantContext): any {
  const result = { ...body };
  const messages: any[] = Array.isArray(result.messages) ? [...result.messages] : [];
  const policy = tenant.mergePolicies;

  // ── System prompt injection ──────────────────────────────────────────────
  if (tenant.resolvedSystemPrompt) {
    const mode = policy.system_prompt ?? 'prepend';

    if (mode === 'prepend') {
      result.messages = [
        { role: 'system', content: tenant.resolvedSystemPrompt },
        ...messages,
      ];
    } else if (mode === 'append') {
      result.messages = [
        ...messages,
        { role: 'system', content: tenant.resolvedSystemPrompt },
      ];
    } else if (mode === 'overwrite') {
      result.messages = [
        { role: 'system', content: tenant.resolvedSystemPrompt },
        ...messages.filter((m: any) => m.role !== 'system'),
      ];
    }
    // 'ignore': leave messages unchanged
  }

  // ── Skills (tools) injection ─────────────────────────────────────────────
  if (tenant.resolvedSkills && tenant.resolvedSkills.length > 0) {
    const mode = policy.skills ?? 'merge';

    if (mode === 'overwrite') {
      result.tools = tenant.resolvedSkills;
    } else if (mode === 'merge') {
      const existing: any[] = result.tools ?? [];
      const agentNames = new Set(
        tenant.resolvedSkills.map((s: any) => s.function?.name ?? s.name),
      );
      const deduped = existing.filter(
        (t: any) => !agentNames.has(t.function?.name ?? t.name),
      );
      result.tools = [...tenant.resolvedSkills, ...deduped];
    }
    // 'ignore': leave tools unchanged
  }

  return result;
}

// ---------------------------------------------------------------------------
// handleMcpRoundTrip
// ---------------------------------------------------------------------------

/**
 * If the provider response contains tool_calls whose names match registered
 * MCP endpoints on the agent, call those endpoints, inject tool results, and
 * re-send to the provider — one round-trip maximum.
 *
 * Only applies to non-streaming (JSON) responses.
 * Returns `{ body, didCallMcp }`.
 */
export async function handleMcpRoundTrip(
  requestBody: any,
  responseBody: any,
  tenant: TenantContext,
  provider: BaseProvider,
  proxyReq: ProxyRequest,
): Promise<{ body: any; didCallMcp: boolean }> {
  const toolCalls: any[] | undefined =
    responseBody?.choices?.[0]?.message?.tool_calls;

  if (!toolCalls?.length || !tenant.resolvedMcpEndpoints?.length) {
    return { body: responseBody, didCallMcp: false };
  }

  const endpointMap = new Map<string, any>(
    tenant.resolvedMcpEndpoints.map((ep: any) => [ep.name, ep]),
  );

  const mcpCalls = toolCalls.filter((tc: any) =>
    endpointMap.has(tc.function?.name),
  );
  if (!mcpCalls.length) {
    return { body: responseBody, didCallMcp: false };
  }

  // Call all matching MCP endpoints in parallel
  const toolResults = await Promise.all(
    mcpCalls.map(async (tc: any) => {
      const endpoint = endpointMap.get(tc.function.name)!;
      let args: unknown;
      try {
        args =
          typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments;
      } catch {
        args = {};
      }

      try {
        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: tc.function.name, arguments: args },
            id: tc.id,
          }),
        });
        const data = (await res.json()) as any;
        return {
          role: 'tool' as const,
          tool_call_id: tc.id,
          content: JSON.stringify(data.result ?? data),
        };
      } catch (err) {
        return {
          role: 'tool' as const,
          tool_call_id: tc.id,
          content: JSON.stringify({
            error: 'MCP call failed',
            detail: String(err),
          }),
        };
      }
    }),
  );

  // Re-send with updated messages: original messages + assistant reply + tool results
  const updatedMessages = [
    ...requestBody.messages,
    responseBody.choices[0].message,
    ...toolResults,
  ];

  const followUpReq: ProxyRequest = {
    ...proxyReq,
    body: { ...requestBody, messages: updatedMessages },
  };

  const followUp = await provider.proxy(followUpReq);
  return { body: followUp.body, didCallMcp: true };
}
