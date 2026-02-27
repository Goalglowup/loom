/**
 * Admin Dashboard Smoke Tests
 *
 * Covers:
 *  - Admin login / logout
 *  - Traces list renders
 *  - Analytics page renders (charts visible)
 *  - Tenant management panel visible
 *
 * Requires: Loom stack running (`docker-compose up`)
 * Run: npm run test:smoke
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { By } from 'selenium-webdriver';
import {
  buildDriver,
  adminLogin,
  waitForVisible,
  waitForUrl,
  BASE_URL,
} from './helpers.js';
import type { WebDriver } from 'selenium-webdriver';

describe('Admin Dashboard smoke tests', () => {
  let driver: WebDriver;

  beforeAll(async () => {
    driver = buildDriver();
  });

  afterAll(async () => {
    await driver.quit();
  });

  // -------------------------------------------------------------------------
  it('admin login → lands on dashboard', async () => {
    await adminLogin(driver);
    const url = await driver.getCurrentUrl();
    expect(url).toMatch(/\/dashboard/);
  });

  // -------------------------------------------------------------------------
  it('traces list renders with table', async () => {
    await driver.get(`${BASE_URL}/dashboard`);
    // The default dashboard route shows traces — wait for a table or list element
    const tableOrList = await waitForVisible(
      driver,
      By.css('table, [data-testid="traces-list"], .traces-table, .trace-row'),
      15000,
    );
    expect(tableOrList).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  it('analytics page renders with charts', async () => {
    await driver.get(`${BASE_URL}/dashboard/analytics`);
    // Recharts renders SVG elements — wait for at least one
    const chart = await waitForVisible(
      driver,
      By.css('.recharts-wrapper, svg.recharts-surface, [data-testid="chart"]'),
      15000,
    );
    expect(chart).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  it('analytics summary cards visible', async () => {
    await driver.get(`${BASE_URL}/dashboard/analytics`);
    // Summary section contains metric cards
    const cards = await driver.findElements(
      By.css('.summary-card, [data-testid="summary-card"], .metric-card'),
    );
    // Fallback: any element containing "Requests" text
    if (cards.length === 0) {
      const page = await driver.getPageSource();
      expect(page).toMatch(/Requests|Total Requests/i);
    } else {
      expect(cards.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  it('admin page renders tenant list', async () => {
    await driver.get(`${BASE_URL}/dashboard/admin`);
    // Admin page has tenant management — wait for tenant list or create button
    const tenantSection = await waitForVisible(
      driver,
      By.css(
        '[data-testid="tenant-list"], .tenant-row, table, button[data-testid="create-tenant"], button',
      ),
      15000,
    );
    expect(tenantSection).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  it('tenant selector dropdown present on analytics page', async () => {
    await driver.get(`${BASE_URL}/dashboard/analytics`);
    const selector = await waitForVisible(
      driver,
      By.css('select, [data-testid="tenant-selector"], .tenant-select'),
      15000,
    );
    expect(selector).toBeTruthy();
  });
});
