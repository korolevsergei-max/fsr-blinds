import { chromium } from 'playwright';

(async () => {
  console.log('🚀 Starting Playwright smoke test...');
  const browser = await chromium.launch({ headless: true }); // Set to true for automation, user can change to false to observe
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('🌐 Navigating to example.com...');
  await page.goto('https://example.com');

  const title = await page.title();
  console.log(`📄 Page title: ${title}`);

  if (title === 'Example Domain') {
    console.log('✅ Smoke test passed!');
  } else {
    console.error('❌ Smoke test failed: Unexpected title.');
    process.exit(1);
  }

  await browser.close();
  console.log('🏁 Browser closed.');
})();
