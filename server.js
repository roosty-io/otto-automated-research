import 'dotenv/config';
import express from 'express';
import { chromium } from 'playwright';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const ZIK_EMAIL = process.env.ZIK_EMAIL;
const ZIK_PASSWORD = process.env.ZIK_PASSWORD;

// Optional security: set BOT_API_KEY in Render and require it from n8n
const BOT_API_KEY = process.env.BOT_API_KEY;

function requireApiKey(req) {
  if (!BOT_API_KEY) return true; // allow if not set
  const k = req.headers['x-api-key'];
  return k && k === BOT_API_KEY;
}

function assertEnv() {
  if (!ZIK_EMAIL || !ZIK_PASSWORD) {
    throw new Error('Missing ZIK_EMAIL or ZIK_PASSWORD env vars');
  }
}

async function zikLogin(page) {
  // Go directly to login page (more stable than homepage)
  await page.goto('https://zikanalytics.com/login', { waitUntil: 'domcontentloaded' });

  // Let scripts settle
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Use stable selectors
  const email = page.locator('#email');
  const password = page.locator('input[type="password"]');

  // Wait for email field
  await email.first().waitFor({ state: 'visible', timeout: 60000 });

  // Fill credentials
  await email.fill(ZIK_EMAIL, { timeout: 60000 });
  await password.first().waitFor({ state: 'visible', timeout: 60000 });
  await password.fill(ZIK_PASSWORD, { timeout: 60000 });

  // Click submit (cover common variants)
  const loginBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Log In")').first();
  await loginBtn.waitFor({ state: 'visible', timeout: 60000 });
  await loginBtn.click();

  // Wait for post-login navigation
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
}

async function fetchCandidates({ limit = 25 }) {
  assertEnv();

  const browser = await chromium.launch({
    headless: true,
    // Helpful in some cloud environments
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();

  try {
    await zikLogin(page);

    // V1 extraction: look for ASIN patterns in the current page
    const html = await page.content();
    const asinMatches = [...new Set((html.match(/\bB0[A-Z0-9]{8}\b/g) || []))].slice(0, limit);

    return {
      ok: true,
      found_asins: asinMatches.length,
      candidates: asinMatches.map((asin) => ({
        asin,
        source: 'zik',
        raw_title: null
      }))
    };
  } catch (err) {
    // ✅ Debug payload: tells us exactly what page ZIK served (captcha, block, redirect, etc.)
    let url = '';
    let title = '';
    let screenshotB64 = '';

    try { url = page.url(); } catch {}
    try { title = await page.title(); } catch {}

    // Screenshot helps confirm bot challenges visually
    try {
      const buf = await page.screenshot({ fullPage: true });
      screenshotB64 = buf.toString('base64');
    } catch {}

    return {
      ok: false,
      error: String(err?.message || err),
      debug: {
        url,
        title,
        screenshot_b64: screenshotB64 ? screenshotB64.slice(0, 250) + '...(truncated)' : ''
      }
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

app.get('/health', (_, res) => res.json({ ok: true }));

// Call: /zik/candidates?limit=50
app.get('/zik/candidates', async (req, res) => {
  if (!requireApiKey(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const limit = Number(req.query.limit || 25);
  const result = await fetchCandidates({ limit });
  res.json(result);
});

app.listen(PORT, () => console.log(`ZIK bot listening on ${PORT}`));
