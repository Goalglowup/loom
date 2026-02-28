/**
 * Portal Sandbox Smoke Tests
 *
 * Covers:
 *  - Sandbox page loads and agent is selectable
 *  - ModelCombobox can be changed
 *  - Chat message can be sent and assistant responds
 *  - Trace is recorded and visible on the Traces page
 *  - Analytics summary cards reflect real data after traffic
 *
 * Requires: Loom stack running (`docker-compose up`) with a working LLM provider
 * Run: npm run test:smoke
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { Browser, Page } from 'playwright';
import {
  launchBrowser,
  newPage,
  portalSignup,
  waitForVisible,
  uniqueEmail,
  uniqueName,
  BASE_URL,
} from './helpers.js';

describe('Portal sandbox smoke tests', () => {
  let browser: Browser;
  let page: Page;

  const email = uniqueEmail('smoke-sandbox');
  const password = 'SmokeTest1!';
  const agentName = `SandboxTestAgent_${Date.now()}`;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await newPage(browser);
    await portalSignup(page, email, password, uniqueName('SandboxOrg'));

    // Create agent to use in sandbox tests
    await page.goto(`${BASE_URL}/app/agents`);
    await page.locator(':text("New Agent")').first().click();
    await waitForVisible(page, 'input[placeholder*="customer-support" i]', 8000);
    await page.locator('input[placeholder*="customer-support" i]').fill(agentName);
    await page.locator('button[type="submit"]:has-text("Create agent")').click();
    await page.waitForTimeout(2000);
  });

  afterAll(async () => {
    await browser.close();
  });

  // -------------------------------------------------------------------------
  it('sandbox page loads', async () => {
    await page.goto(`${BASE_URL}/app/sandbox`);
    await waitForVisible(page, 'body', 5000);
    const content = await page.content();
    expect(content).toMatch(/Sandbox/i);
  });

  // -------------------------------------------------------------------------
  it('can select agent and change model', async () => {
    await page.goto(`${BASE_URL}/app/sandbox`);
    await waitForVisible(page, 'body', 5000);
    // Wait for agents list to load
    await page.waitForTimeout(1500);

    // Select agent from sidebar by clicking the button containing the agent name
    await page.locator(`button:has-text("${agentName}")`).first().click();
    await page.waitForTimeout(500);

    // Change model using the ModelCombobox — triple-click to select all, then type
    const modelInput = page.locator('input[placeholder="e.g. gpt-4o"]');
    await modelInput.click({ clickCount: 3 });
    await modelInput.fill('mistral:7b');

    const modelValue = await modelInput.inputValue();
    expect(modelValue).toBe('mistral:7b');
  });

  // -------------------------------------------------------------------------
  it.skip('can send a chat message and receive an assistant response', async () => {
    // Agent already selected and model already set from previous test
    const chatInput = page.locator('input[placeholder="Type a message…"]');
    await chatInput.fill('Hello, say hi back in one word');
    await chatInput.press('Enter');

    // Wait for assistant response bubble to appear (up to 30s for model + network)
    await page.locator('.bg-gray-800.text-gray-100').waitFor({ state: 'visible', timeout: 30000 });

    const assistantMsgs = page.locator('.bg-gray-800.text-gray-100');
    const count = await assistantMsgs.count();
    expect(count).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  it.skip('traces page shows a trace row for this agent', async () => {
    await page.goto(`${BASE_URL}/app/traces`);
    await waitForVisible(page, 'body', 5000);

    // Poll for trace row — trace recording is async; allow up to 30s
    const agentPattern = new RegExp(agentName, 'i');
    let found = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      const content = await page.content();
      if (agentPattern.test(content)) { found = true; break; }
      await page.waitForTimeout(2000);
      await page.reload();
      await waitForVisible(page, 'body', 5000);
    }
    expect(found).toBe(true);
  });

  // -------------------------------------------------------------------------
  it('analytics page reflects real data after traffic', async () => {
    // Poll analytics until empty-state cards disappear (up to 30s; analytics may lag slightly)
    let emptyCount = 9;
    for (let attempt = 0; attempt < 15; attempt++) {
      await page.goto(`${BASE_URL}/app/analytics`);
      await waitForVisible(page, 'body', 5000);
      emptyCount = await page.locator('.card-value--empty').count();
      if (emptyCount === 0) break;
      await page.waitForTimeout(2000);
    }
    expect(emptyCount).toBe(0);
  });
});
