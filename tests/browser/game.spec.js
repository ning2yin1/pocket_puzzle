import { test, expect } from "@playwright/test";
import { Game } from "../../src/engine.js";
import { stages } from "../../src/stages.js";
import { fresh } from "../../src/save.js";
const storageKey = "pocket-puzzle-save";
async function ready(page) {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "はじめる", exact: true }),
  ).toBeVisible();
}
async function install(page, data) {
  await page.evaluate(
    ([key, d]) => localStorage.setItem(key, JSON.stringify(d)),
    [storageKey, data],
  );
  await page.reload();
  await page.getByRole("button", { name: "つづきから", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
}
async function tapCell(page, at) {
  const box = await page.locator("canvas").boundingBox();
  await page.touchscreen.tap(
    box.x + ((at[1] + 0.5) * box.width) / 8,
    box.y + ((at[0] + 0.5) * box.height) / 8,
  );
}
async function swipe(page, a, b) {
  const rect = await page.locator("canvas").boundingBox();
  const point = (at) => ({
    clientX: rect.x + ((at[1] + 0.5) * rect.width) / 8,
    clientY: rect.y + ((at[0] + 0.5) * rect.height) / 8,
    pointerId: 1,
    pointerType: "touch",
    bubbles: true,
  });
  await page.locator("canvas").dispatchEvent("pointerdown", point(a));
  await page.locator("canvas").dispatchEvent("pointerup", point(b));
}
test("title/map/collection and settings persist without page scroll at 320–430px", async ({
  page,
}) => {
  await page.addInitScript(() => {
    CanvasRenderingContext2D.prototype.roundRect = undefined;
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.getByRole("button", { name: "♪ BGM ON" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "♪ BGM OFF" })).toBeVisible();
  await page.getByRole("button", { name: "森のマップへ" }).click();
  await expect(
    page.getByRole("button", { name: "ステージ2 未解放" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "なかまコレクション" }).click();
  await expect(page.locator(".character")).toHaveCount(6);
  await expect(page.locator(".character.locked")).toHaveCount(5);
  await page.getByRole("button", { name: "‹ マップ" }).click();
  await page.getByRole("button", { name: "ステージ1", exact: true }).click();
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const rect = await page.locator("canvas").boundingBox();
    const tools = await page.locator(".tools").boundingBox();
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(tools.y + 2);
    expect(tools.y + tools.height).toBeLessThanOrEqual(height);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(height);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "test-results/puzzle-small.png" });
  expect(errors).toEqual([]);
});
test("valid touch swap animates, consumes a move, and resumes saved board", async ({
  page,
}) => {
  await ready(page);
  const d = fresh(),
    g = new Game(stages[0]);
  let pair;
  outer: for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      for (const b of [
        [r + 1, c],
        [r, c + 1],
      ])
        if (g.board[b[0]]?.[b[1]]) {
          g.swap([r, c], b);
          const yes = g.matches().length;
          g.swap([r, c], b);
          if (yes) {
            pair = [[r, c], b];
            break outer;
          }
        }
  d.current = { id: 1, state: g.snapshot() };
  await install(page, d);
  await swipe(page, ...pair);
  await expect(page.locator("#moves")).toHaveText("23");
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).current.state.moves,
        storageKey,
      ),
    )
    .toBe(23);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).current,
    storageKey,
  );
  await page.reload();
  await page.getByRole("button", { name: "つづきから" }).click();
  await expect(page.locator("#moves")).toHaveText("23");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).current,
      storageKey,
    ),
  ).toEqual(saved);
});
test("three stages finish, unlock map and characters, award coins; loss can retry", async ({
  page,
}) => {
  await ready(page);
  let d = fresh();
  for (const stage of stages) {
    const g = new Game(stage);
    Object.entries(stage.goals).forEach(([k, n]) => (g.progress[k] = n));
    g.moves = 3;
    let a, b;
    if (stage.id === 3) {
      g.progress.rock = 3;
      g.blocked.get("3,3").hp = 1;
      g.board[3][2].type = "rocketH";
      a = [3, 2];
    } else {
      const color = stage.id === 1 ? 0 : 2;
      g.progress[color] = stage.goals[color] - 1;
      g.board[3][3].type = "rainbow";
      g.board[3][4].color = color;
      a = [3, 3];
      b = [3, 4];
    }
    d.current = { id: stage.id, state: g.snapshot() };
    await install(page, d);
    if (b) await swipe(page, a, b);
    else await tapCell(page, a);
    await expect(
      page.getByRole("heading", { name: "ステージクリア！" }),
    ).toBeVisible({ timeout: 15000 });
    d = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      storageKey,
    );
    expect(d.cleared).toContain(stage.id);
    expect(d.coins).toBe(stage.id * 60);
    await page.getByRole("button", { name: "マップへ", exact: true }).click();
    if (stage.id < 3)
      await expect(
        page.getByRole("button", {
          name: `ステージ${stage.id + 1}`,
          exact: true,
        }),
      ).toBeEnabled();
  }
  await page.getByRole("button", { name: "なかまコレクション" }).click();
  await expect(page.locator(".character.locked")).toHaveCount(0);
  await page.screenshot({ path: "test-results/collection.png" });
  const g = new Game(stages[0]);
  g.moves = 1;
  g.board[3][3].type = "rocketH";
  d.current = { id: 1, state: g.snapshot() };
  await install(page, d);
  await tapCell(page, [3, 3]);
  await expect(
    page.getByRole("heading", { name: "あともう少し！" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "もう一度" }).click();
  await expect(page.locator("#moves")).toHaveText("24");
});
test("PWA cached under repository subpath reloads and plays fully offline", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    caches.open("pocket-forest-obsolete");
  });
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await page.evaluate(
    async () =>
      await (
        await fetch(document.querySelector("link[rel=manifest]").href)
      ).json(),
  );
  for (const icon of manifest.icons) {
    const response = await page.request.get(
      new URL(icon.src, "http://127.0.0.1:4173/pocket_puzzle/").href,
    );
    expect(response.status()).toBe(200);
  }
  expect(await page.evaluate(() => caches.keys())).not.toContain(
    "pocket-forest-obsolete",
  );
  expect(manifest.display).toBe("standalone");
  expect(manifest.orientation).toBe("portrait");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "はじめる" })).toBeVisible();
  await page.getByRole("button", { name: "はじめる" }).click();
  await page.getByRole("button", { name: "ステージ1", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "💡 ヒント" }).click();
  const d = fresh(),
    g = new Game(stages[0]);
  g.board[3][3].type = "rocketH";
  d.current = { id: 1, state: g.snapshot() };
  await install(page, d);
  await tapCell(page, [3, 3]);
  await expect(page.locator("#moves")).toHaveText("23");
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).current.state.moves,
        storageKey,
      ),
    )
    .toBe(23);
  await page.screenshot({ path: "test-results/offline.png" });
});

test("title and map retain supplied artwork", async ({ page }) => {
  await ready(page);
  const background = () =>
    page
      .locator(".screen")
      .evaluate((el) => getComputedStyle(el).backgroundImage.slice(5, -2));
  expect(await background()).toBe(
    "http://127.0.0.1:4173/pocket_puzzle/assets/backgrounds/title_forest.png",
  );
  expect((await page.request.get(await background())).status()).toBe(200);
  await page.screenshot({ path: "test-results/title.png" });
  await page.getByRole("button", { name: "はじめる", exact: true }).click();
  expect(await background()).toBe(
    "http://127.0.0.1:4173/pocket_puzzle/assets/backgrounds/map_forest.png",
  );
  expect((await page.request.get(await background())).status()).toBe(200);
  await page.screenshot({ path: "test-results/map.png" });
});
