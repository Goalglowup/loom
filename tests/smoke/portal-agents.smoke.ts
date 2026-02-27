/**
 * Portal Agents & Subtenants Smoke Tests
 *
 * Covers:
 *  - Agents page loads
 *  - Owner can create an agent
 *  - Agent appears in the agents list
 *  - Subtenants page loads
 *  - Owner can create a subtenant
 *  - Subtenant appears in the list
 *
 * Requires: Loom stack running (`docker-compose up`)
 * Run: npm run test:smoke
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { Browser, Page } from 'playwright';
import {
  launchBrowser,
  newPage,
  portalSignup,
  waitForVisible,
  screenshotIfDocsMode,
  uniqueEmail,
  uniqueName,
  BASE_URL,
} from './helpers.js';

describe('Portal agents smoke tests', () => {
  let browser: Browser;
  let page: Page;

  const email = uniqueEmail('smoke-agents');
  const password = 'SmokeTest1!';

  let agentName: string;
  let subtenantName: string;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await newPage(browser);
    agentName = uniqueName('TestAgent');
    subtenantName = uniqueName('TestSubtenant');
    await portalSignup(page, email, password, uniqueName('AgentsOrg'));
  });

  afterAll(async () => {
    await browser.close();
  });

  // -------------------------------------------------------------------------
  it('owner can navigate to Agents page', async () => {
    await page.goto(`${BASE_URL}/app/agents`);
    await waitForVisible(page, 'body', 5000);
    await screenshotIfDocsMode(page, 'portal-agents', 'Portal agents page', 'Agents');
    const content = await page.content();
    expect(content).toMatch(/Agents?/i);
  });

  // -------------------------------------------------------------------------
  it('owner can create an agent', async () => {
    await page.goto(`${BASE_URL}/app/agents`);

    // Click "+ New Agent"
    await page.locator(':text("New Agent")').first().click();

    // Fill name input
    await waitForVisible(page, 'input[placeholder*="customer-support" i]', 8000);
    await screenshotIfDocsMode(page, 'portal-agent-editor', 'Agent editor form', 'Agents');
    await page.locator('input[placeholder*="customer-support" i]').fill(agentName);

    // Submit
    await page.locator('button[type="submit"]:has-text("Create agent")').click();

    await page.waitForTimeout(2000);
    await screenshotIfDocsMode(page, 'portal-agent-created', 'Agent created in list', 'Agents');
  });

  // -------------------------------------------------------------------------
  it('agent appears in the agents list', async () => {
    const content = await page.content();
    expect(content).toMatch(new RegExp(agentName, 'i'));
  });

  // -------------------------------------------------------------------------
  it('owner can navigate to Subtenants page', async () => {
    await page.goto(`${BASE_URL}/app/subtenants`);
    await waitForVisible(page, 'body', 5000);
    const content = await page.content();
    expect(content).toMatch(/Subtenants?/i);
  });

  // -------------------------------------------------------------------------
  it('owner can create a subtenant', async () => {
    await page.goto(`${BASE_URL}/app/subtenants`);

    // Click "+ Create Subtenant"
    await page.locator(':text("Create Subtenant")').first().click();

    // Fill name input
    await waitForVisible(page, 'input[placeholder*="Engineering" i]', 8000);
    await page.locator('input[placeholder*="Engineering" i]').fill(subtenantName);

    // Submit
    await page.locator('button[type="submit"]:has-text("Create")').click();

    await page.waitForTimeout(2000);
  });

  // -------------------------------------------------------------------------
  it('subtenant appears in the list', async () => {
    const content = await page.content();
    expect(content).toMatch(new RegExp(subtenantName, 'i'));
  });
});
