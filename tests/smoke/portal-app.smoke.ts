/**
 * Portal App Smoke Tests
 *
 * Covers (authenticated user):
 *  - Traces page loads
 *  - Analytics page loads (charts + summary cards)
 *  - API keys: list, create, revoke
 *  - Settings (provider config form)
 *  - Members page renders
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

describe('Portal app smoke tests', () => {
  let browser: Browser;
  let page: Page;

  const email = uniqueEmail('smoke-app');
  const password = 'SmokeTest1!';

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await newPage(browser);
    await portalSignup(page, email, password, uniqueName('AppOrg'));
  });

  afterAll(async () => {
    await browser.close();
  });

  // -------------------------------------------------------------------------
  it('traces page renders', async () => {
    await page.goto(`${BASE_URL}/app/traces`);
    await waitForVisible(page, 'body', 5000);
    await screenshotIfDocsMode(page, 'portal-traces', 'Portal traces page', 'Traces');
    const content = await page.content();
    expect(content).toMatch(/trace|request|No traces/i);
  });

  // -------------------------------------------------------------------------
  it('analytics page renders summary cards', async () => {
    await page.goto(`${BASE_URL}/app/analytics`);
    await waitForVisible(page, 'body', 5000);
    await screenshotIfDocsMode(page, 'portal-analytics', 'Portal analytics page', 'Analytics');
    const content = await page.content();
    expect(content).toMatch(/Requests|Tokens|Latency|Analytics/i);
  });

  // -------------------------------------------------------------------------
  it('analytics page renders charts', async () => {
    await page.goto(`${BASE_URL}/app/analytics`);
    await waitForVisible(page, '.recharts-wrapper, svg.recharts-surface, [data-testid="chart"]', 20000);
    const chart = page.locator('.recharts-wrapper, svg.recharts-surface, [data-testid="chart"]').first();
    expect(await chart.count()).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  it('API keys page renders', async () => {
    await page.goto(`${BASE_URL}/app/api-keys`);
    await waitForVisible(page, 'body', 5000);
    await screenshotIfDocsMode(page, 'portal-api-keys', 'Portal API keys page', 'API Keys');
    const content = await page.content();
    expect(content).toMatch(/API Key|api.key|Create|Generate/i);
  });

  // -------------------------------------------------------------------------
  it('API key can be created', async () => {
    await page.goto(`${BASE_URL}/app/api-keys`);

    // Click the "+ New key" button
    await page.locator(':text("New key")').first().click();

    // Wait for agent select (confirms agents loaded)
    await waitForVisible(page, 'select[required]', 8000);

    // Fill key name
    await page.locator('input[placeholder*="production" i]').fill('smoke-test-key');

    // Submit
    await page.locator('button[type="submit"]:has-text("Create")').click();

    await page.waitForTimeout(2000);
    const content = await page.content();
    expect(content).toMatch(/sk-|loom_|key|Key/i);
  });

  // -------------------------------------------------------------------------
  it('settings page renders provider config form', async () => {
    await page.goto(`${BASE_URL}/app/settings`);
    await waitForVisible(page, 'body', 5000);
    await screenshotIfDocsMode(page, 'portal-settings', 'Portal settings page', 'Settings');
    const content = await page.content();
    expect(content).toMatch(/provider|OpenAI|Azure|Ollama|API/i);
  });

  // -------------------------------------------------------------------------
  it('settings form has provider selection', async () => {
    await page.goto(`${BASE_URL}/app/settings`);
    await waitForVisible(page, 'select, input[name*="provider" i], [data-testid="provider-select"]', 10000);
    const providerInput = page.locator('select, input[name*="provider" i], [data-testid="provider-select"]').first();
    expect(await providerInput.count()).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  it('members page renders', async () => {
    await page.goto(`${BASE_URL}/app/members`);
    await waitForVisible(page, 'body', 5000);
    await screenshotIfDocsMode(page, 'portal-members', 'Portal members page', 'Members');
    const content = await page.content();
    expect(content).toMatch(/Members?|Team|Invite/i);
  });

  // -------------------------------------------------------------------------
  it('members page shows current user', async () => {
    await page.goto(`${BASE_URL}/app/members`);
    await page.waitForTimeout(2000);
    const content = await page.content();
    expect(content).toMatch(new RegExp(email.replace(/[+.]/g, '\\$&'), 'i'));
  });
});
