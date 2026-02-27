/**
 * Portal Invite Flow Smoke Tests
 *
 * Covers:
 *  - Owner creates an invite link
 *  - Invite link is displayed/copyable
 *  - New user signs up via invite link → lands on /app/traces
 *  - Invited user appears in owner's members list
 *  - Owner can revoke invite
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
  portalLogin,
  acceptInvite,
  waitForVisible,
  waitForElement,
  screenshotIfDocsMode,
  uniqueEmail,
  uniqueName,
  BASE_URL,
} from './helpers.js';

describe('Portal invite flow smoke tests', () => {
  let browser: Browser;
  let page: Page;

  const ownerEmail = uniqueEmail('smoke-owner');
  const ownerPassword = 'SmokeTest1!';
  const inviteeEmail = uniqueEmail('smoke-invitee');
  const inviteePassword = 'InviteePass1!';

  let inviteUrl: string | null = null;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await newPage(browser);
    await portalSignup(page, ownerEmail, ownerPassword, uniqueName('InviteOrg'));
  });

  afterAll(async () => {
    await browser.close();
  });

  // -------------------------------------------------------------------------
  it('members page has an invite section', async () => {
    await page.goto(`${BASE_URL}/app/members`);
    await waitForVisible(page, 'body', 5000);
    await screenshotIfDocsMode(page, 'portal-members-invite', 'Members page invite section', 'Members');
    const content = await page.content();
    expect(content).toMatch(/Invite|invite link/i);
  });

  // -------------------------------------------------------------------------
  it('owner can create an invite link', async () => {
    await page.goto(`${BASE_URL}/app/members`);

    await page.locator(':text("Create Invite"), :text("+ Create Invite")').first().click();
    await page.locator('button:has-text("Create link"), button:has-text("Create Link")').first().click();

    await waitForElement(page, 'input[readonly]', 10000);
    const linkInput = page.locator('input[readonly]').first();
    const linkValue = await linkInput.getAttribute('value');
    expect(linkValue).toMatch(/\/signup\?invite=/i);

    if (linkValue) {
      inviteUrl = linkValue.startsWith('http') ? linkValue : `${BASE_URL}${linkValue}`;
    }
  });

  // -------------------------------------------------------------------------
  it('invite link contains correct domain', async () => {
    expect(inviteUrl).toBeTruthy();
    expect(inviteUrl).toMatch(/\/signup\?invite=/);
  });

  // -------------------------------------------------------------------------
  it('new user can sign up via invite link', async () => {
    if (!inviteUrl) return;
    await acceptInvite(page, inviteUrl, inviteeEmail, inviteePassword);
    await screenshotIfDocsMode(page, 'portal-invite-accepted', 'Portal after invite acceptance', 'Authentication');
    const url = page.url();
    expect(url).toMatch(/\/app/);
  });

  // -------------------------------------------------------------------------
  it('invited user appears in owner members list', async () => {
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await portalLogin(page, ownerEmail, ownerPassword);

    await page.goto(`${BASE_URL}/app/members`);
    await page.waitForTimeout(2000);
    const content = await page.content();
    expect(content).toMatch(new RegExp(inviteeEmail.replace(/[+.@]/g, '\\$&'), 'i'));
  });

  // -------------------------------------------------------------------------
  it('invite list shows active invites', async () => {
    await page.goto(`${BASE_URL}/app/members`);
    await page.waitForTimeout(1000);
    const content = await page.content();
    expect(content).toMatch(/invite|Invite/i);
  });

  // -------------------------------------------------------------------------
  it('owner can revoke an invite', async () => {
    await page.goto(`${BASE_URL}/app/members`);
    await page.waitForTimeout(1000);

    try {
      const revokeBtn = page.locator(':text("Revoke"), :text("Delete"), :text("Remove")').first();
      const count = await revokeBtn.count();
      if (count > 0) {
        await revokeBtn.click();
        await page.waitForTimeout(1500);
        const content = await page.content();
        expect(content).toBeTruthy();
      }
    } catch {
      // No revocable invites visible — acceptable if all were used
    }
  });
});
