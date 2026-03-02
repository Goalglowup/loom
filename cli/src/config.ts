import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.arachne');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface ArachneConfig {
  gatewayUrl?: string;
  token?: string;
}

export function readConfig(): ArachneConfig {
  try {
    const data = readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function writeConfig(config: ArachneConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

export function getGatewayUrl(): string {
  const config = readConfig();
  const url = config.gatewayUrl ?? process.env.ARACHNE_GATEWAY_URL;
  if (!url) {
    throw new Error('No gateway URL configured. Run: arachne login <url>');
  }
  return url;
}

export function getToken(): string {
  const config = readConfig();
  const token = config.token ?? process.env.ARACHNE_TOKEN;
  if (!token) {
    throw new Error('Not authenticated. Run: arachne login');
  }
  return token;
}
