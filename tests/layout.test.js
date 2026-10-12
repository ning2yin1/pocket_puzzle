import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAP_PADS, coverGeometry, projectPoint } from "../src/layout.js";
import { paths } from "../src/assets.js";
import { Renderer } from "../src/renderer.js";
import { Game } from "../src/engine.js";
import { stages } from "../src/stages.js";

test("cover geometry preserves aspect ratio and covers the whole viewport", () => {
  for (const [w, h] of [
    [320, 460],
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
  ]) {
    const g = coverGeometry(w, h);
    assert.ok(g.width >= w);
    assert.ok(g.height >= h);
    assert.ok(Math.abs(g.width / g.height - 864 / 1536) < 1e-9);
    assert.ok(g.x <= 0 && g.y <= 0);
    for (const pad of MAP_PADS) {
      const p = projectPoint(pad, g);
      assert.ok(p.x >= 22 && p.x <= w - 22);
      assert.ok(p.y >= 22 && p.y <= h - 22);
    }
  }
});
test("every artwork reference exists and PNG dimensions match manifest", () => {
  const manifest = JSON.parse(readFileSync("assets-manifest.json", "utf8"));
  const actual = new Map(manifest.assets.map((e) => [e.path, e]));
  for (const path of new Set(Object.values(paths))) {
    const png = readFileSync(path);
    const e = actual.get(path);
    assert.ok(e, path);
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), e.width, path);
    assert.equal(png.readUInt32BE(20), e.height, path);
  }
  assert.equal(paths.rocketV, paths.rocketH);
  assert.equal(paths.fruit3, "assets/pieces/grapes.png");
  assert.equal(paths.tnt, "assets/powerups/bomb.png");
  assert.equal(paths.rainbow, "assets/powerups/rainbow.png");
});
test("vertical rocket rotates the same artwork 90 degrees and both stay inside cell", () => {
  for (const type of ["rocketH", "rocketV"]) {
    let angle, rect;
    const ctx = {
      save() {},
      restore() {},
      translate() {},
      rotate(a) {
        angle = a;
      },
      drawImage(...args) {
        rect = args.slice(1);
      },
    };
    Renderer.prototype.sprite.call(
      { ctx, cell: 40, image: () => ({ width: 744, height: 423 }) },
      { type },
      20,
      20,
    );
    assert.equal(angle, type === "rocketV" ? Math.PI / 2 : 0);
    const [x, y, w, h] = rect;
    assert.ok(Math.abs(w / h - 744 / 423) < 1e-9);
    assert.ok(w <= 40 && h <= 40);
    assert.equal(x, -w / 2);
    assert.equal(y, -h / 2);
  }
});
test("horizontal rocket clears a row; vertical rocket clears a column", async () => {
  for (const type of ["rocketH", "rocketV"]) {
    const g = new Game(stages[0]);
    g.board[3][3].type = type;
    let first;
    await g.act([3, 3], null, async (e) => {
      if (e.kind === "clear" && !first) first = e;
    });
    assert.equal(first.removed.length, 8);
    assert.ok(
      first.removed.every((p) => (type === "rocketH" ? p.r === 3 : p.c === 3)),
    );
  }
});
