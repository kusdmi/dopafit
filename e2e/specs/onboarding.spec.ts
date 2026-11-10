import { expect, test } from '../fixtures/test.ts';
import { paths } from '../support/paths.ts';

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { tag: '', width: 1440, heights: [900, 600, 390] },
    { tag: '@mobile', width: 390, heights: [844, 667] },
    { tag: '@narrow', width: 320, heights: [700, 568] },
    { tag: '@large', width: 430, heights: [932, 600] },
  ]) {
    test(`UI-03 онбординг сохраняет голову и гантель в кадре: ${theme} ${viewport.tag}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(paths.onboarding);
      const photo = page.getByRole('presentation');
      const next = page.getByRole('button', { name: 'Далее' });

      for (const height of viewport.heights) {
        await page.setViewportSize({ width: viewport.width, height });
        await page.getByRole('main').evaluate((node) => {
          node.scrollTop = 0;
        });
        await expect(photo).toBeVisible();
        await expect
          .poll(() => photo.evaluate((node: HTMLImageElement) => node.naturalHeight))
          .toBeGreaterThan(0);
        const geometry = await photo.evaluate((node: HTMLImageElement) => {
          const box = node.getBoundingClientRect();
          const scale = Math.max(box.width / node.naturalWidth, box.height / node.naturalHeight);
          const visibleWidth = box.width / scale / node.naturalWidth;
          const visibleHeight = box.height / scale / node.naturalHeight;
          return {
            width: box.width,
            height: box.height,
            left: (1 - visibleWidth) / 2,
            right: (1 + visibleWidth) / 2,
            top: (1 - visibleHeight) / 2,
            bottom: (1 + visibleHeight) / 2,
          };
        });
        const screenshot = test.info().outputPath(`${theme}-${viewport.width}x${height}.png`);
        await page.screenshot({ path: screenshot });
        await test.info().attach(`${theme}-${viewport.width}x${height}`, {
          path: screenshot,
          contentType: 'image/png',
        });
        expect(geometry.height).toBeGreaterThan(150);
        const expectedRatio = height >= 800 ? 350 / 517 : height <= 640 ? 4 / 3 : 1;
        expect(geometry.width / geometry.height).toBeCloseTo(expectedRatio, 2);
        // The source's head, elbows and dumbbell are inside this safe region.
        // Every responsive crop must retain it, including after viewport resize.
        expect(geometry.left).toBeLessThanOrEqual(0.28);
        expect(geometry.right).toBeGreaterThanOrEqual(0.72);
        expect(geometry.top).toBeLessThanOrEqual(0.18);
        expect(geometry.bottom).toBeGreaterThanOrEqual(0.81);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await next.scrollIntoViewIfNeeded();
        await expect(next).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
          viewport.width,
        );
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
      }

      await next.click();
      await expect(page).toHaveURL(paths.welcome);
      await page.reload();
      await expect(page).toHaveURL(paths.welcome);
      await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
    });
  }
}
