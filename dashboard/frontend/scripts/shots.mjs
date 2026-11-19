import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = 'docs/img';
const SCREENSHOT_DIR = join(process.cwd(), OUTPUT_DIR);
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const LOGS = [];
const ERRORS = [];

async function logError(context, error) {
  const msg = `[ERROR] ${context}: ${error.message || error}`;
  ERRORS.push(msg);
  console.error(msg);
}

async function takeScreenshot(page, name, options = {}) {
  const filename = `${name}.png`;
  const filepath = join(SCREENSHOT_DIR, filename);
  try {
    await page.screenshot({ path: filepath, fullPage: options.fullPage || false, ...options });
    LOGS.push(`[OK] ${filename} saved`);
    console.log(`[OK] ${filename} saved`);
  } catch (error) {
    await logError(`screenshot ${name}`, error);
    // Try to save anyway
    try {
      await page.screenshot({ path: filepath, fullPage: options.fullPage || false });
      LOGS.push(`[RECOVERED] ${filename} saved after error`);
    } catch (e) {
      LOGS.push(`[FAILED] ${filename} could not be saved`);
    }
  }
}

async function waitForNetworkIdle(page, timeout = 3000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
    await page.waitForTimeout(3000); // extra 3s for animations
  } catch (e) {
    await page.waitForTimeout(3000);
  }
}

async function run() {
  console.log('Starting Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Log console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      LOGS.push(`[CONSOLE ERROR] ${msg.text()}`);
      console.error(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    LOGS.push(`[PAGE ERROR] ${error.message}`);
    console.error(`[PAGE ERROR] ${error.message}`);
  });

  try {
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await waitForNetworkIdle(page);

    // ========== SHOT 01: overview.png ==========
    console.log('--- Shot 01: overview ---');
    await takeScreenshot(page, '01-overview', { fullPage: true });

    // ========== SHOT 02: sphere-hover.png ==========
    console.log('--- Shot 02: sphere-hover ---');
    try {
      // Find the sphere canvas and hover near center
      const canvas = await page.locator('canvas').first();
      if (await canvas.count() > 0) {
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.waitForTimeout(500);
        }
      }
    } catch (e) { await logError('sphere-hover hover', e); }
    await takeScreenshot(page, '02-sphere-hover', { fullPage: true });

    // ========== SHOT 03: sphere-rotated.png ==========
    console.log('--- Shot 03: sphere-rotated ---');
    try {
      const canvas = await page.locator('canvas').first();
      if (await canvas.count() > 0) {
        const box = await canvas.boundingBox();
        if (box) {
          const centerX = box.x + box.width / 2;
          const centerY = box.y + box.height / 2;
          await page.mouse.move(centerX, centerY);
          await page.mouse.down();
          await page.mouse.move(centerX + 300, centerY);
          await page.mouse.up();
          await page.waitForTimeout(1000);
        }
      }
    } catch (e) { await logError('sphere-rotated drag', e); }
    await takeScreenshot(page, '03-sphere-rotated', { fullPage: true });

    // ========== SHOT 04: inspector.png ==========
    console.log('--- Shot 04: inspector ---');
    try {
      const canvas = await page.locator('canvas').first();
      if (await canvas.count() > 0) {
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await page.waitForTimeout(1000);
        }
      }
    } catch (e) { await logError('inspector click', e); }
    await takeScreenshot(page, '04-inspector', { fullPage: true });

    // ========== SHOT 05: signal-selector.png ==========
    console.log('--- Shot 05: signal-selector ---');
    try {
      // Look for a dropdown/button with "SIGNAL" text
      const signalBtn = page.locator('button, select, [role="combobox"]').filter({ hasText: /SIGNAL/i }).first();
      if (await signalBtn.count() > 0) {
        await signalBtn.click();
        await page.waitForTimeout(500);
      }
    } catch (e) { await logError('signal-selector click', e); }
    await takeScreenshot(page, '05-signal-selector', { fullPage: true });

    // ========== SHOT 06 & 07: split train/val ==========
    console.log('--- Shot 06/07: split dropdown ---');
    try {
      // Look for split dropdown in TOP CANDIDATES
      const splitDropdown = page.locator('select, [role="combobox"]').filter({ hasText: /TRAIN|VAL|TEST/i }).first();
      if (await splitDropdown.count() > 0) {
        // Change to TRAIN
        await splitDropdown.selectOption({ label: /TRAIN/i });
        await page.waitForTimeout(500);
        await takeScreenshot(page, '06-split-train', { fullPage: true });

        // Change to VAL
        await splitDropdown.selectOption({ label: /VAL/i });
        await page.waitForTimeout(500);
        await takeScreenshot(page, '07-split-val', { fullPage: true });
      } else {
        LOGS.push('[SKIP] Split dropdown not visible');
        console.log('[SKIP] Split dropdown not visible');
      }
    } catch (e) {
      await logError('split dropdown', e);
      LOGS.push('[SKIP] Split dropdown not found or failed');
    }

    // ========== SHOTS 08, 09, 10: threshold slider ==========
    console.log('--- Shots 08/09/10: threshold ---');
    try {
      // Find threshold slider
      const slider = page.locator('input[type="range"]').first();
      if (await slider.count() > 0) {
        // Check if there's a collapsed dock - look for expand button
        const expandBtn = page.locator('button').filter({ hasText: /threshold|dock|expand/i }).first();
        if (await expandBtn.count() > 0 && await expandBtn.isVisible()) {
          await expandBtn.click();
          await page.waitForTimeout(300);
        }

        // Set to 0.2
        await slider.evaluate(el => { el.value = '0.2'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
        await page.waitForTimeout(500);
        await takeScreenshot(page, '08-threshold-low', { fullPage: true });

        // Set to default (0.5)
        await slider.evaluate(el => { el.value = '0.5'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
        await page.waitForTimeout(500);
        await takeScreenshot(page, '09-threshold-default', { fullPage: true });

        // Set to 0.8
        await slider.evaluate(el => { el.value = '0.8'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
        await page.waitForTimeout(500);
        await takeScreenshot(page, '10-threshold-high', { fullPage: true });
      }
    } catch (e) { await logError('threshold slider', e); }

    // ========== SHOTS 11, 12, 13: MODE buttons ==========
    console.log('--- Shots 11/12/13: MODE buttons ---');
    const modes = ['ERRORS', 'COMPARE', 'KEPLER90'];
    for (let i = 0; i < modes.length; i++) {
      const mode = modes[i];
      try {
        const btn = page.locator('button').filter({ hasText: new RegExp(mode, 'i') }).first();
        if (await btn.count() > 0 && await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      } catch (e) { await logError(`mode-${mode} click`, e); }
      const shotNum = 11 + i;
      await takeScreenshot(page, `${shotNum.toString().padStart(2, '0')}-mode-${mode.toLowerCase()}`, { fullPage: true });
    }

    // ========== SHOTS 14, 15, 16: panel screenshots ==========
    console.log('--- Shots 14/15/16: panel screenshots ---');
    const panels = ['PR', 'ROC', 'HISTOGRAM'];
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      try {
        // Find panel by title
        const panelEl = page.locator('h2, h3, h4, .panel-title, [data-testid]').filter({ hasText: new RegExp(panel, 'i') }).first();
        if (await panelEl.count() > 0) {
          await panelEl.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          await takeScreenshot(page, `${14 + i}-panels-${panel.toLowerCase()}`);
        } else {
          LOGS.push(`[SKIP] Panel ${panel} not found`);
        }
      } catch (e) { await logError(`panel-${panel}`, e); }
    }

    // ========== SHOTS 17, 18: responsive viewports ==========
    console.log('--- Shots 17/18: responsive ---');
    // Tablet 1024x768
    await page.setViewportSize({ width: 1024, height: 768 });
    await waitForNetworkIdle(page);
    await takeScreenshot(page, '17-tablet-1024x768', { fullPage: true });

    // Laptop 1366x768
    await page.setViewportSize({ width: 1366, height: 768 });
    await waitForNetworkIdle(page);
    await takeScreenshot(page, '18-laptop-1366x768', { fullPage: true });

  } catch (error) {
    await logError('main run', error);
  } finally {
    await browser.close();

    // Write logs
    const logPath = join(SCREENSHOT_DIR, 'shots.log');
    writeFileSync(logPath, LOGS.join('\n') + '\n\nERRORS:\n' + ERRORS.join('\n'));
    console.log(`\nLogs written to ${logPath}`);
    console.log('All shots completed.');
    console.log('\n=== SUMMARY ===');
    LOGS.forEach(l => console.log(l));
    if (ERRORS.length > 0) {
      console.log('\nErrors:');
      ERRORS.forEach(e => console.log(e));
    }
  }
}

run().catch(console.error);