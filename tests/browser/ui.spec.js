import { test, expect } from "@playwright/test";
import {
  coverGeometry,
  projectPoint,
  MAP_PADS,
  TITLE_CHARACTERS,
} from "../../src/layout.js";
const sizes = [
  { width: 320, height: 460, top: 0, bottom: 0 },
  { width: 320, height: 568, top: 20, bottom: 0 },
  { width: 375, height: 667, top: 0, bottom: 0 },
  { width: 390, height: 844, top: 47, bottom: 34 },
  { width: 430, height: 932, top: 59, bottom: 34 },
];
async function title(page) {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "はじめる", exact: true }),
  ).toBeVisible();
}
async function safeArea(page, size) {
  await page.setViewportSize(size);
  await page.evaluate(({ top, bottom }) => {
    document.documentElement.style.setProperty("--safe-top", `${top}px`);
    document.documentElement.style.setProperty("--safe-bottom", `${bottom}px`);
    dispatchEvent(new Event("resize"));
  }, size);
}
async function covered(page, size) {
  const box = await page.locator("#app").boundingBox();
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(size.width);
  expect(box.height).toBe(size.height);
  const css = await page.locator(".screen").evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      size: s.backgroundSize,
      position: s.backgroundPosition,
      repeat: s.backgroundRepeat,
    };
  });
  const [w, h] = css.size.split(" ").map(parseFloat);
  expect(w).toBeGreaterThanOrEqual(size.width);
  expect(h).toBeGreaterThanOrEqual(size.height);
  expect(w / h).toBeCloseTo(864 / 1536, 5);
  expect(css.repeat).toBe("no-repeat");
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    size.height,
  );
}
test("title controls never cover the artwork characters; start is navigation and preserves old saves", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await title(page);
  await page.evaluate(() =>
    localStorage.setItem(
      "pocket-puzzle-save",
      JSON.stringify({
        version: 1,
        cleared: [1],
        unlocked: ["mochi", "piyo", "midorin"],
        coins: 60,
        settings: { bgm: true, sfx: false },
        current: null,
      }),
    ),
  );
  await page.reload();
  for (const size of sizes) {
    await safeArea(page, size);
    await covered(page, size);
    const g = coverGeometry(size.width, size.height);
    const end = projectPoint(
      { x: 0, y: TITLE_CHARACTERS.y + TITLE_CHARACTERS.height },
      g,
    ).y;
    const controls = await page.locator(".title-actions").boundingBox();
    expect(controls.y).toBeGreaterThanOrEqual(end + 8);
    expect(controls.y + controls.height).toBeLessThanOrEqual(
      size.height - size.bottom - 8,
    );
    const start = await page
      .getByRole("button", { name: "はじめる", exact: true })
      .boundingBox();
    expect(start.height).toBeGreaterThanOrEqual(44);
    for (const button of await page.locator(".settings button").all()) {
      const box = await button.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(size.top);
      expect(box.y + box.height).toBeLessThan(
        end - TITLE_CHARACTERS.height * g.scale,
      );
    }
  }
  await expect(page.getByRole("button", { name: "森のマップへ" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "つづきから" })).toHaveCount(0);
  await page.getByRole("button", { name: "はじめる", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "ステージ1 クリア済み" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "ステージ2", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("pocket-puzzle-save")).coins,
    ),
  ).toBe(60);
  expect(errors).toEqual([]);
});
test("transparent stage hit regions stay centered on the actual image pedestals at all sizes", async ({
  page,
}) => {
  await title(page);
  await page.getByRole("button", { name: "はじめる", exact: true }).click();
  for (const size of sizes) {
    await safeArea(page, size);
    await covered(page, size);
    const g = coverGeometry(size.width, size.height);
    for (const pad of MAP_PADS) {
      const p = projectPoint(pad, g);
      const node = page.locator(`[data-stage="${pad.id}"]`),
        rect = await node.boundingBox();
      expect(rect.x + rect.width / 2).toBeCloseTo(p.x, 1);
      expect(rect.y + rect.height / 2).toBeCloseTo(p.y, 1);
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(
        await node.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe("rgba(0, 0, 0, 0)");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/map-iphone.png" });
});
test("puzzle frame, targets and controls fit a short Safari viewport and a safe-area PWA viewport", async ({
  page,
}) => {
  await title(page);
  await page.getByRole("button", { name: "はじめる", exact: true }).click();
  await page.getByRole("button", { name: "ステージ1", exact: true }).click();
  for (const size of sizes) {
    await safeArea(page, size);
    await covered(page, size);
    const board = await page.locator("canvas").boundingBox(),
      tools = await page.locator(".tools").boundingBox(),
      goals = await page.locator(".goals").boundingBox();
    expect(board.y).toBeGreaterThanOrEqual(goals.y + goals.height);
    expect(board.y + board.height).toBeLessThanOrEqual(tools.y + 1);
    expect(tools.y + tools.height).toBeLessThanOrEqual(
      size.height - size.bottom - 4,
    );
    expect(
      await page
        .locator("canvas")
        .evaluate((el) => el.getContext("2d").imageSmoothingEnabled),
    ).toBe(false);
    for (const button of await page.locator(".tools button").all())
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "あそび方" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "わかった！" }).click();
});
