import { test, expect } from '@playwright/test';

/**
 * Phase-1 boot smoke (docs/areas/00-core-platform.md §8.10, docs/compatibility.md §8). Runs on all
 * four engines. The remaining §8 cases need gameplay/audio/HUD/storage features that arrive in
 * later phases, so they are scaffolded as `test.fixme` with the owning area noted — to be
 * "unfixme'd" when that area lands. (Nothing is faked to make a gate pass.)
 */
test('boots to a rendered 384×216 canvas with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');

  const canvas = page.locator('#game');
  await expect(canvas).toBeVisible();

  // Backing buffer MUST stay 384×216 (docs/compatibility.md §2 — never a device-pixel canvas).
  const size = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return { w: c.width, h: c.height };
  });
  expect(size).toEqual({ w: 384, h: 216 });

  await page.waitForTimeout(250); // let the fixed-timestep loop run a few frames
  expect(errors).toEqual([]);
});

// --- Remaining compatibility.md §8 suite (unblock as each area lands) ---
test.fixme('tap in the sky aims + fires + destroys a drone, and pointercancel ceases fire', () => {
  // area 01 Gameplay Engine + area 06 Audio
});
test.fixme('audio context reaches "running" after the first gesture', () => {
  // area 06 Audio
});
test.fixme('localStorage round-trips; in-memory fallback engages when storage throws', () => {
  // areas 07/08 (settings + highscores UI) exercising the persistence layer end-to-end
});
test.fixme('mobile-viewport run holds the frame-time budget under CPU throttling', () => {
  // area 01 Gameplay Engine (representative drone count)
});
test.fixme('HUD five-icon glyph row screenshot snapshot matches per engine', () => {
  // area 10 HUD & UI + area 11 Art (final icon sprites)
});
