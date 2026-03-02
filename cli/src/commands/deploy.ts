import { Command } from 'commander';
import { getGatewayUrl, getToken } from '../config.js';

function parseArtifactRef(ref: string): { org: string; name: string; tag: string } {
  const match = ref.match(/^([^/]+)\/([^:]+):(.+)$/);
  if (!match) {
    throw new Error(`Invalid artifact reference: "${ref}". Expected format: org/name:tag`);
  }
  return { org: match[1], name: match[2], tag: match[3] };
}

export const deployCommand = new Command('deploy')
  .description('Deploy an artifact to a tenant environment')
  .argument('<artifact>', 'Artifact reference (org/name:tag)')
  .option('--env <env>', 'Deployment environment', 'prod')
  .action(async (artifact: string, options: { env: string }) => {
    let gatewayUrl: string;
    let token: string;
    try {
      gatewayUrl = getGatewayUrl();
      token = getToken();
    } catch {
      console.error("Error: not logged in. Run 'arachne login' first.");
      process.exit(1);
    }

    let parsed: { org: string; name: string; tag: string };
    try {
      parsed = parseArtifactRef(artifact);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }

    const { org, name, tag } = parsed;
    const env = options.env || 'prod';

    const res = await fetch(`${gatewayUrl}/v1/registry/deploy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ org, name, tag, env }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Error: ${res.status} ${body}`);
      process.exit(1);
    }

    console.log(`✓ Deployed ${org}/${name}:${tag} → env:${env}`);
  });
