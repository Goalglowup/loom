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
import { By } from 'selenium-webdriver';
import {
  buildDriver,
  portalSignup,
  waitForVisible,
  waitForElement,
  uniqueEmail,
  uniqueName,
  BASE_URL,
} from './helpers.js';
import type { WebDriver } from 'selenium-webdriver';

describe('Portal agents smoke tests', () => {
  let driver: WebDriver;

  const email = uniqueEmail('smoke-agents');
  const password = 'SmokeTest1!';

  let agentName: string;
  let subtenantName: string;

  beforeAll(async () => {
    driver = buildDriver();
    agentName = uniqueName('TestAgent');
    subtenantName = uniqueName('TestSubtenant');
    await portalSignup(driver, email, password, uniqueName('AgentsOrg'));
  });

  afterAll(async () => {
    await driver.quit();
  });

  // -------------------------------------------------------------------------
  it('owner can navigate to Agents page', async () => {
    await driver.get(`${BASE_URL}/app/agents`);
    await waitForVisible(driver, By.css('body'), 5000);
    const page = await driver.getPageSource();
    expect(page).toMatch(/Agents?/i);
  });

  // -------------------------------------------------------------------------
  it('owner can create an agent', async () => {
    await driver.get(`${BASE_URL}/app/agents`);

    // Click the "+ New Agent" button to open the editor panel
    const newAgentBtn = await waitForVisible(
      driver,
      By.xpath('//*[contains(text(), "New Agent")]'),
      10000,
    );
    await newAgentBtn.click();

    // Wait for the AgentEditor form — name input has placeholder "e.g. customer-support-agent"
    const nameInput = await waitForVisible(
      driver,
      By.css('input[placeholder*="customer-support" i]'),
      8000,
    );
    await nameInput.sendKeys(agentName);

    // Submit — button text is "Create agent" in create mode
    const saveBtn = await driver.findElement(
      By.xpath('//button[@type="submit"][contains(., "Create agent")]'),
    );
    await saveBtn.click();

    // Wait for the editor panel to close and agent to appear in table
    await driver.sleep(2000);
  });

  // -------------------------------------------------------------------------
  it('agent appears in the agents list', async () => {
    // Still on /app/agents after creation; table should reflect the new agent
    const page = await driver.getPageSource();
    expect(page).toMatch(new RegExp(agentName, 'i'));
  });

  // -------------------------------------------------------------------------
  it('owner can navigate to Subtenants page', async () => {
    await driver.get(`${BASE_URL}/app/subtenants`);
    await waitForVisible(driver, By.css('body'), 5000);
    const page = await driver.getPageSource();
    expect(page).toMatch(/Subtenants?/i);
  });

  // -------------------------------------------------------------------------
  it('owner can create a subtenant', async () => {
    await driver.get(`${BASE_URL}/app/subtenants`);

    // Click the "+ Create Subtenant" button to reveal the form
    const createBtn = await waitForVisible(
      driver,
      By.xpath('//*[contains(text(), "Create Subtenant")]'),
      10000,
    );
    await createBtn.click();

    // Fill in the subtenant name — placeholder is "e.g. Engineering Team"
    const nameInput = await waitForVisible(
      driver,
      By.css('input[placeholder*="Engineering" i]'),
      8000,
    );
    await nameInput.sendKeys(subtenantName);

    // Submit
    const submitBtn = await driver.findElement(
      By.xpath('//button[@type="submit"][contains(., "Create")]'),
    );
    await submitBtn.click();

    await driver.sleep(2000);
  });

  // -------------------------------------------------------------------------
  it('subtenant appears in the list', async () => {
    // Still on /app/subtenants after creation; table should reflect the new subtenant
    const page = await driver.getPageSource();
    expect(page).toMatch(new RegExp(subtenantName, 'i'));
  });
});
