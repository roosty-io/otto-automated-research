import 'dotenv/config';
import express from 'express';
import { chromium } from 'playwright';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ZIK_EMAIL = process.env.ZIK_EMAIL;
const ZIK_PASSWORD = process.env.ZIK_PASSWORD;

const SELECTORS = {
  emailInput: 'input[type="email"], input[name="email"], input[placeholder*="Email" i]',
  passwordInput: 'input[type="password"], input[name="password"], input[placeholder*="Password" i]',
  loginButton: 'button:has-text("Log In"), button:has-text("Login"), button[type="submit"]',
};

function assertEnv() {
  if (!ZIK_EMAIL || !ZIK_PASSWORD) {
    throw new Error('Missing ZIK_EMAIL or ZIK_PASSWORD env vars');
  }
}

async function zikLogin(page) {
  await page.goto('https://zikanalytics.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await page.waitForSelector(SELECTORS.emailInput, { timeout: 20000 });
  await page.fill(SELECTORS.emailInput, ZIK_EMAIL);
  await page.fill(SELECTORS.passwordInput, ZIK_PASSWORD);
  await page.click(SELECTORS.loginButton);

  await page.waitForTimeout(4000);
}

async function fetchCandidates({ limit = 25 }) {
  assertEnv();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await zikLogin(page);

    // V1: extract ASIN-like patterns from the loaded HTML
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
    return { ok: false, error: String(err?.message || err) };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

app.get('/health', (_, res) => res.json({ ok: true }));

app.get('/zik/candidates', async (req, res) => {
  const limit = Number(req.query.limit || 25);
  const result = await fetchCandidates({ limit });
  res.json(result);
});

app.listen(PORT, () => console.log(`ZIK bot listening on ${PORT}`));
