import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { getGatewayUrl, getToken } from '../config.js';

function handleApiError(res: Response, body: string): void {
  if (res.status === 401) {
    console.error('Error: authentication failed. Your token may have expired. Run: arachne login');
  } else if (res.status === 403) {
    console.error('Error: insufficient permissions.');
  } else {
    console.error(`Error: ${res.status} ${body}`);
  }
}

interface DeploymentInfo {
  id: string;
  name: string;
  status: string;
  runtimeToken: string | null;
  artifact?: { name?: string };
}

async function resolveDeployment(
  gatewayUrl: string,
  token: string,
  name: string,
): Promise<{ runtimeToken: string; deploymentId: string } | null> {
  const headers = { Authorization: `Bearer ${token}` };

  // 1. Try exact match by deployment name
  const byNameRes = await fetch(
    `${gatewayUrl}/v1/registry/deployments/by-name/${encodeURIComponent(name)}`,
    { headers },
  );

  if (byNameRes.ok) {
    const deployment = (await byNameRes.json()) as DeploymentInfo;
    return validateDeployment(deployment, name);
  }

  // 2. If not found by deployment name, try matching by artifact name
  if (byNameRes.status === 404) {
    const listRes = await fetch(`${gatewayUrl}/v1/registry/deployments`, { headers });
    if (!listRes.ok) {
      const body = await listRes.text();
      handleApiError(listRes, body);
      return null;
    }

    const deployments = (await listRes.json()) as DeploymentInfo[];

    // Match by artifact name: try exact match first, then strip org prefix
    // (artifact names are stored without org, e.g. "my-agent" not "org/my-agent")
    const bareName = name.includes('/') ? name.split('/').pop()! : name;
    const matches = deployments.filter(
      (d) => d.artifact?.name === name || d.artifact?.name === bareName,
    );

    if (matches.length === 1) {
      return validateDeployment(matches[0], name);
    }

    if (matches.length > 1) {
      const ready = matches.filter((d) => d.status === 'READY');
      if (ready.length === 1) {
        return validateDeployment(ready[0], name);
      }
      if (ready.length > 1) {
        console.error(`Error: multiple READY deployments found for artifact "${bareName}":`);
        for (const d of ready) {
          console.error(`  ${d.name} (${d.status})`);
        }
        console.error(`\nSpecify the deployment name: arachne chat <deployment-name>`);
        return null;
      }
      // All non-READY
      console.error(`Error: deployments found for artifact "${bareName}" but none are READY:`);
      for (const d of matches) {
        console.error(`  ${d.name} (${d.status})`);
      }
      return null;
    }

    console.error(`Error: no deployment found matching "${name}". Run: arachne list`);
    return null;
  }

  // Other error
  const body = await byNameRes.text();
  handleApiError(byNameRes, body);
  return null;
}

function validateDeployment(
  deployment: DeploymentInfo,
  name: string,
): { runtimeToken: string; deploymentId: string } | null {
  if (deployment.status !== 'READY') {
    console.error(`Error: deployment "${name}" exists but status is ${deployment.status} (expected READY).`);
    return null;
  }
  if (!deployment.runtimeToken) {
    console.error(`Error: deployment "${name}" has no runtime token.`);
    return null;
  }
  return { runtimeToken: deployment.runtimeToken, deploymentId: deployment.id };
}

async function sendChat(
  gatewayUrl: string,
  runtimeToken: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
): Promise<string | null> {
  const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${runtimeToken}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    handleApiError(res, body);
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? null;
}

export const chatCommand = new Command('chat')
  .description('Chat with a deployed agent')
  .argument('<name>', 'Deployment name or artifact name')
  .option('-m, --message <message>', 'Send a single message (one-shot mode)')
  .option('--model <model>', 'Model to use', 'gpt-4.1')
  .action(async (name: string, options: { message?: string; model: string }) => {
    let gatewayUrl: string;
    let token: string;
    try {
      gatewayUrl = getGatewayUrl();
      token = getToken();
    } catch {
      console.error("Error: not logged in. Run 'arachne login' first.");
      process.exit(1);
    }

    const deployment = await resolveDeployment(gatewayUrl, token, name);
    if (!deployment) {
      process.exit(1);
    }

    const { runtimeToken } = deployment;
    const model = options.model;

    // ── One-shot mode ──────────────────────────────────────────────────────
    if (options.message) {
      const content = await sendChat(
        gatewayUrl,
        runtimeToken,
        [{ role: 'user', content: options.message }],
        model,
      );
      if (content === null) {
        process.exit(1);
      }
      console.log(content);
      return;
    }

    // ── Interactive mode ───────────────────────────────────────────────────
    console.log(`Chat with ${name} (type /quit to exit)`);

    const messages: Array<{ role: string; content: string }> = [];

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = (): void => {
      rl.question('> ', async (input) => {
        const trimmed = input.trim();
        if (trimmed === '/quit' || trimmed === '/exit') {
          rl.close();
          return;
        }

        if (!trimmed) {
          prompt();
          return;
        }

        messages.push({ role: 'user', content: trimmed });

        const content = await sendChat(gatewayUrl, runtimeToken, messages, model);
        if (content === null) {
          // Remove the failed message so the user can retry
          messages.pop();
          prompt();
          return;
        }

        messages.push({ role: 'assistant', content });
        console.log(content);
        prompt();
      });
    };

    rl.on('close', () => {
      process.exit(0);
    });

    prompt();
  });
