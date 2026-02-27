import { Builder, By, WebDriver, WebElement, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

// ---------------------------------------------------------------------------
// Config (override via env vars)
// ---------------------------------------------------------------------------
// Use LOOM_BASE_URL to avoid collision with Vite's built-in BASE_URL env var
export const BASE_URL = process.env['LOOM_BASE_URL'] ?? 'http://localhost:3000';
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'changeme';
export const HEADLESS = process.env.HEADLESS !== 'false';

// ---------------------------------------------------------------------------
// Driver factory
// ---------------------------------------------------------------------------
export function buildDriver(): WebDriver {
  const options = new chrome.Options();
  if (HEADLESS) {
    options.addArguments('--headless=new', '--disable-gpu');
  }
  options.addArguments(
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,900',
  );
  return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

// ---------------------------------------------------------------------------
// Wait helpers
// ---------------------------------------------------------------------------
export async function waitForUrl(driver: WebDriver, pattern: RegExp, timeout = 10000) {
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return pattern.test(url);
  }, timeout, `URL did not match ${pattern} within ${timeout}ms`);
}

export async function waitForText(
  driver: WebDriver,
  locator: ReturnType<typeof By.css>,
  text: string,
  timeout = 10000,
): Promise<WebElement> {
  return driver.wait(until.elementTextContains(driver.findElement(locator), text), timeout);
}

export async function waitForElement(
  driver: WebDriver,
  locator: ReturnType<typeof By.css>,
  timeout = 10000,
): Promise<WebElement> {
  return driver.wait(until.elementLocated(locator), timeout);
}

export async function waitForVisible(
  driver: WebDriver,
  locator: ReturnType<typeof By.css>,
  timeout = 10000,
): Promise<WebElement> {
  const el = await waitForElement(driver, locator, timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

// ---------------------------------------------------------------------------
// Login helpers
// ---------------------------------------------------------------------------

/** Log in to the admin dashboard. Navigates to /dashboard/admin and submits credentials. */
export async function adminLogin(driver: WebDriver): Promise<void> {
  await driver.get(`${BASE_URL}/dashboard/admin`);
  const userField = await waitForVisible(driver, By.css('input[type="text"][placeholder="Username"], input[aria-label="Username"]'));
  await userField.sendKeys(ADMIN_USERNAME);
  const passField = await driver.findElement(By.css('input[type="password"]'));
  await passField.sendKeys(ADMIN_PASSWORD);
  const submitBtn = await driver.findElement(By.css('button[type="submit"]'));
  await submitBtn.click();
  // Wait for the admin panel to appear (login overlay disappears)
  await waitForElement(driver, By.css('.admin-page, .admin-header, button.admin-logout-btn'));
  await driver.sleep(500); // let React settle
}

/** Log in to the tenant portal. Returns the JWT token stored in localStorage. */
export async function portalLogin(
  driver: WebDriver,
  email: string,
  password: string,
): Promise<void> {
  await driver.get(`${BASE_URL}/login`);
  const emailField = await waitForVisible(driver, By.css('input[type="email"]'));
  await emailField.sendKeys(email);
  const passField = await driver.findElement(By.css('input[type="password"]'));
  await passField.sendKeys(password);
  await passField.submit();
  await waitForUrl(driver, /\/app/);
  await driver.sleep(500);
}

/** Sign up a new tenant on the portal. Returns the created email/password. */
export async function portalSignup(
  driver: WebDriver,
  email: string,
  password: string,
  tenantName: string,
): Promise<void> {
  await driver.get(`${BASE_URL}/signup`);
  await waitForVisible(driver, By.css('input[type="email"]'));

  // Fill org name field first (it appears before email in the DOM)
  try {
    const nameField = await driver.findElement(
      By.css('input[type="text"], input[placeholder*="Acme" i], input[placeholder*="corp" i], input[placeholder*="company" i], input[placeholder*="organization" i]'),
    );
    await nameField.sendKeys(tenantName);
  } catch {
    // Field may not exist — tenant name auto-derived from email domain
  }

  await driver.findElement(By.css('input[type="email"]')).sendKeys(email);
  await driver.findElement(By.css('input[type="password"]')).sendKeys(password);

  const submitBtn = await driver.findElement(By.css('button[type="submit"]'));
  await submitBtn.click();

  // After signup the API may return an API key which shows a modal before redirecting.
  // Wait for either the dismiss button or the /app URL.
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    if (url.includes('/app')) return true;
    const btns = await driver.findElements(By.xpath("//button[contains(., 'saved')]"));
    return btns.length > 0;
  }, 15000, 'Signup did not redirect or show API key modal');

  // Click the dismiss button if it's showing the API key reveal modal
  const dismissBtns = await driver.findElements(By.xpath("//button[contains(., 'saved')]"));
  if (dismissBtns.length > 0) {
    await dismissBtns[0].click();
  }

  await waitForUrl(driver, /\/app/);
  await driver.sleep(500);
}

/** Accept an invite link by navigating to it and completing signup. */
export async function acceptInvite(
  driver: WebDriver,
  inviteUrl: string,
  email: string,
  password: string,
): Promise<void> {
  await driver.get(inviteUrl);
  await waitForVisible(driver, By.css('input[type="email"]'));
  await driver.findElement(By.css('input[type="email"]')).sendKeys(email);
  await driver.findElement(By.css('input[type="password"]')).sendKeys(password);
  const submitBtn = await driver.findElement(By.css('button[type="submit"]'));
  await submitBtn.click();
  await waitForUrl(driver, /\/app/);
  await driver.sleep(500);
}

// ---------------------------------------------------------------------------
// Unique test data helpers
// ---------------------------------------------------------------------------
let _seq = Date.now();

export function uniqueEmail(prefix = 'smoke'): string {
  return `${prefix}+${_seq++}@test.loom.local`;
}

export function uniqueName(prefix = 'Smoke'): string {
  return `${prefix} ${_seq++}`;
}
