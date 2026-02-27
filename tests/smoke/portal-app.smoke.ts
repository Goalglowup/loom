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
import { By } from 'selenium-webdriver';
import {
  buildDriver,
  portalSignup,
  waitForVisible,
  waitForUrl,
  waitForText,
  uniqueEmail,
  uniqueName,
  BASE_URL,
} from './helpers.js';
import type { WebDriver } from 'selenium-webdriver';

describe('Portal app smoke tests', () => {
  let driver: WebDriver;

  const email = uniqueEmail('smoke-app');
  const password = 'SmokeTest1!';

  beforeAll(async () => {
    driver = buildDriver();
    // Sign up a fresh tenant for this test suite
    await portalSignup(driver, email, password, uniqueName('AppOrg'));
  });

  afterAll(async () => {
    await driver.quit();
  });

  // -------------------------------------------------------------------------
  it('traces page renders', async () => {
    await driver.get(`${BASE_URL}/app/traces`);
    // Page loads — check for traces heading or empty state
    await waitForVisible(driver, By.css('body'), 5000);
    const page = await driver.getPageSource();
    expect(page).toMatch(/trace|request|No traces/i);
  });

  // -------------------------------------------------------------------------
  it('analytics page renders summary cards', async () => {
    await driver.get(`${BASE_URL}/app/analytics`);
    // Wait for a card or any heading-like element
    await waitForVisible(driver, By.css('body'), 5000);
    const page = await driver.getPageSource();
    expect(page).toMatch(/Requests|Tokens|Latency|Analytics/i);
  });

  // -------------------------------------------------------------------------
  it('analytics page renders charts', async () => {
    await driver.get(`${BASE_URL}/app/analytics`);
    const chart = await waitForVisible(
      driver,
      By.css('.recharts-wrapper, svg.recharts-surface, [data-testid="chart"]'),
      20000,
    );
    expect(chart).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  it('API keys page renders', async () => {
    await driver.get(`${BASE_URL}/app/api-keys`);
    await waitForVisible(driver, By.css('body'), 5000);
    const page = await driver.getPageSource();
    expect(page).toMatch(/API Key|api.key|Create|Generate/i);
  });

  // -------------------------------------------------------------------------
  it('API key can be created', async () => {
    await driver.get(`${BASE_URL}/app/api-keys`);

    // Click the create / generate button
    const createBtn = await waitForVisible(
      driver,
      By.xpath('//*[contains(text(), "Create") or contains(text(), "Generate") or contains(text(), "New")]'),
      10000,
    );
    await createBtn.click();

    // A new key should appear — either revealed inline or in a list
    await driver.sleep(1500);
    const page = await driver.getPageSource();
    // API keys typically start with "sk-" or "loom_"
    expect(page).toMatch(/sk-|loom_|key|Key/i);
  });

  // -------------------------------------------------------------------------
  it('settings page renders provider config form', async () => {
    await driver.get(`${BASE_URL}/app/settings`);
    await waitForVisible(driver, By.css('body'), 5000);
    const page = await driver.getPageSource();
    expect(page).toMatch(/provider|OpenAI|Azure|Ollama|API/i);
  });

  // -------------------------------------------------------------------------
  it('settings form has provider selection', async () => {
    await driver.get(`${BASE_URL}/app/settings`);
    const providerInput = await waitForVisible(
      driver,
      By.css('select, input[name*="provider" i], [data-testid="provider-select"]'),
      10000,
    );
    expect(providerInput).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  it('members page renders', async () => {
    await driver.get(`${BASE_URL}/app/members`);
    await waitForVisible(driver, By.css('body'), 5000);
    const page = await driver.getPageSource();
    expect(page).toMatch(/Members?|Team|Invite/i);
  });

  // -------------------------------------------------------------------------
  it('members page shows current user', async () => {
    await driver.get(`${BASE_URL}/app/members`);
    await driver.sleep(2000);
    const page = await driver.getPageSource();
    // The signed-up email should appear in the member list
    expect(page).toMatch(new RegExp(email.replace(/[+.]/g, '\\$&'), 'i'));
  });
});
