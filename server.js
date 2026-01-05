async function zikLogin(page) {
  // Go directly to login page (more stable than homepage)
  await page.goto('https://zikanalytics.com/login', { waitUntil: 'domcontentloaded' });

  // Let scripts settle
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Use the most stable selector from your own HTML: #email
  const email = page.locator('#email');
  const password = page.locator('input[type="password"]');

  // Wait for the email box to exist + be visible
  await email.first().waitFor({ state: 'visible', timeout: 60000 });

  // Fill credentials
  await email.fill(ZIK_EMAIL, { timeout: 60000 });
  await password.first().waitFor({ state: 'visible', timeout: 60000 });
  await password.fill(ZIK_PASSWORD, { timeout: 60000 });

  // Click submit (cover common variants)
  const loginBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Log In")').first();
  await loginBtn.waitFor({ state: 'visible', timeout: 60000 });
  await loginBtn.click();

  // Wait for navigation after login
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
}
