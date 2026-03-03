import { Command } from 'commander';
import * as readline from 'readline';
import { writeConfig, readConfig } from '../config.js';

const DEFAULT_GATEWAY = 'https://api.arachne-ai.com';

function prompt(question: string, defaultVal?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const display = defaultVal ? `${question} (${defaultVal}): ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(display, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const chars: string[] = [];
    const stdin = process.stdin as NodeJS.ReadStream;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(chars.join(''));
          return;
        } else if (char === '\u0003') {
          cleanup();
          process.exit(1);
        } else if (char === '\u007f') {
          chars.pop();
        } else {
          chars.push(char);
        }
      }
    };
    const cleanup = () => {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

export const initCommand = new Command('init')
  .description('Interactive setup wizard — configure gateway URL and API token')
  .action(async () => {
    const existing = readConfig();

    console.log('Welcome to Arachne! Let\'s get you set up.\n');

    const gatewayUrl = await prompt('Gateway URL', existing.gatewayUrl ?? DEFAULT_GATEWAY);
    const token = await promptPassword('API token (input hidden): ');

    if (!token) {
      console.error('Error: API token is required.');
      process.exit(1);
    }

    writeConfig({ gatewayUrl, token });
    console.log('\n✅ Arachne configured. Run `arachne --help` to see available commands.');
  });
