import test from "node:test";
import assert from "node:assert/strict";
import { Game, TYPES } from "../src/engine.js";
import { stages } from "../src/stages.js";
import { fresh, load, save } from "../src/save.js";
function rng(seed = 42) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function game() {
  return new Game({ ...stages[0], goals: { 0: 9999 }, moves: 100 }, rng());
}
function set(g, rows) {
  g.board = rows.map((row) => row.map((x) => (x === null ? null : g.cell(x))));
}
function move(g) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      for (const b of [
        [r + 1, c],
        [r, c + 1],
      ])
        if (g.board[b[0]]?.[b[1]] && g.board[r][c]) {
          g.swap([r, c], b);
          const yes = g.matches().length;
          g.swap([r, c], b);
          if (yes) return [[r, c], b];
        }
}
test("100 seeds: all stages initialize without matches and with moves", () => {
  for (let n = 1; n <= 100; n++)
    for (const s of stages) {
      const g = new Game(s, rng(n));
      assert.equal(g.matches().length, 0);
      assert.ok(g.hasMove());
      assert.equal(g.blocked.size, s.obstacles.length);
    }
});
test("invalid swaps rollback without consuming move", async () => {
  const g = game();
  let invalid;
  for (let r = 0; r < 8 && !invalid; r++)
    for (let c = 0; c < 7 && !invalid; c++) {
      const a = [r, c],
        b = [r, c + 1];
      g.swap(a, b);
      const yes = g.matches().length;
      g.swap(a, b);
      if (!yes) invalid = [a, b];
    }
  const before = JSON.stringify(g.snapshot());
  assert.equal(await g.act(...invalid), false);
  assert.equal(JSON.stringify(g.snapshot()), before);
});
test("valid moves consume exactly one move and settle cascades", async () => {
  const g = game();
  for (let i = 0; i < 30; i++) {
    const events = [];
    await g.act(...move(g), async (e) => events.push(e));
    assert.equal(g.moves, 99 - i);
    assert.equal(g.matches().length, 0);
    assert.ok(g.hasMove());
    assert.ok(events.some((e) => e.kind === "clear"));
    assert.ok(g.board.flat().every(Boolean));
  }
});
test("line, intersection and square matches are detected", () => {
  const g = game();
  set(g, [
    [0, 0, 0, 0, 0],
    [1, 2, 3, 4, 1],
    [2, 3, 4, 1, 2],
  ]);
  g.stage = { ...g.stage, rows: 3, cols: 5 };
  assert.equal(g.matches()[0].runs[0].cells.length, 5);
  set(g, [
    [0, 0, 1, 2, 3],
    [0, 0, 2, 3, 4],
    [1, 2, 3, 4, 0],
  ]);
  assert.ok(g.matches().some((g) => g.square));
});
for (const type of TYPES)
  test(`${type}: tap activation and chain settle`, async () => {
    const g = game();
    g.board[3][3].type = type;
    const events = [];
    assert.ok(await g.act([3, 3], null, async (e) => events.push(e)));
    assert.equal(g.moves, 99);
    assert.ok(events.some((e) => e.effects?.some((x) => x.type === type)));
    assert.equal(g.matches().length, 0);
  });
for (let i = 0; i < TYPES.length; i++)
  for (let j = i; j < TYPES.length; j++)
    test(`combo ${TYPES[i]} + ${TYPES[j]}`, async () => {
      const g = game();
      g.board[3][3].type = TYPES[i];
      g.board[3][4].type = TYPES[j];
      const events = [];
      await g.act([3, 3], [3, 4], async (e) => events.push(e));
      assert.ok(events.some((e) => e.effects?.some((x) => x.type === "combo")));
      assert.equal(g.moves, 99);
      assert.equal(g.matches().length, 0);
    });
test("rocks only take direct power hits, hp and obstacle goals work", async () => {
  const g = new Game(stages[2], rng());
  g.board[3][2].type = "rocketH";
  await g.act([3, 2]);
  assert.equal(g.blocked.get("3,3").hp, 1);
  g.board[3][2].type = "rocketH";
  await g.act([3, 2]);
  assert.ok(!g.blocked.has("3,3"));
  assert.ok(g.progress.rock >= 2);
});
test("hammer on obstacle does not consume moves and settles", async () => {
  const g = new Game(stages[2], rng());
  await g.act([2, 2], null, async () => {}, true);
  assert.ok(!g.blocked.has("2,2"));
  assert.equal(g.moves, 32);
  assert.equal(g.matches().length, 0);
});
test("collapse respects blocked segments and masks", () => {
  const g = new Game(
    {
      ...stages[0],
      mask: Array.from({ length: 8 }, (_, r) =>
        Array.from({ length: 8 }, (_, c) => !(r === 0 && c === 0)),
      ),
      obstacles: [{ r: 4, c: 2, type: "rock", hp: 2 }],
    },
    rng(),
  );
  g.board[3][2] = null;
  g.board[7][2] = null;
  const top = g.board[0][2].id;
  g.collapse();
  assert.equal(g.board[4][2], null);
  assert.equal(g.board[0][0], null);
  assert.equal(g.board[1][2].id, top);
});
test("completion and failure state", () => {
  const g = game();
  g.moves = 0;
  assert.equal(g.status(), "lost");
  g.progress[0] = 9999;
  assert.equal(g.status(), "won");
});
test("save roundtrip and corrupted saves", () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k),
    setItem: (k, v) => store.set(k, v),
  };
  const d = fresh();
  d.coins = 60;
  d.current = { id: 1, state: game().snapshot() };
  assert.ok(save(d, storage));
  assert.deepEqual(load(storage), d);
  const g = game();
  g.restore(d.current.state);
  assert.deepEqual(g.snapshot(), d.current.state);
  storage.setItem("pocket-puzzle-save", "bad");
  assert.deepEqual(load(storage), fresh());
  assert.equal(
    save(d, {
      setItem: () => {
        throw Error();
      },
    }),
    false,
  );
});
for (const [type, coords, source] of [
  [
    "rocketH",
    [
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
    ],
    [2, 3],
  ],
  [
    "rocketV",
    [
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
    ],
    [3, 2],
  ],
  [
    "rainbow",
    [
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
      [3, 5],
    ],
    [2, 3],
  ],
  [
    "tnt",
    [
      [3, 2],
      [3, 3],
      [3, 4],
      [4, 3],
      [5, 3],
    ],
    [2, 3],
  ],
  [
    "propeller",
    [
      [3, 3],
      [3, 4],
      [4, 3],
      [4, 4],
    ],
    [2, 3],
  ],
])
  test(`matching pattern creates ${type} at swapped destination`, async () => {
    const g = game();
    set(
      g,
      Array.from({ length: 8 }, (_, r) =>
        Array.from({ length: 8 }, (_, c) => (r + c) % 5),
      ),
    );
    coords.forEach(([r, c]) => (g.board[r][c].color = 0));
    g.board[3][3].color = 1;
    g.board[source[0]][source[1]].color = 0;
    let generated;
    await g.act(source, [3, 3], async (e) => {
      if (e.kind === "clear" && e.chain === 1) generated = g.board[3][3]?.type;
    });
    assert.equal(generated, type);
  });
test("a special caught in another blast activates once", async () => {
  const g = game();
  g.board[3][3].type = "rocketH";
  g.board[3][5].type = "tnt";
  const effects = [];
  await g.act([3, 3], null, async (e) => effects.push(...(e.effects ?? [])));
  assert.equal(
    effects.filter((e) => e.type === "tnt" && e.at[1] === 5).length,
    1,
  );
});
test("crate damaged once per wave; normal matches do not damage rocks", async () => {
  const g = game();
  g.blocked.set("3,3", { r: 3, c: 3, type: "crate", hp: 2 });
  g.blocked.set("4,3", { r: 4, c: 3, type: "rock", hp: 2 });
  g.board[3][3] = null;
  g.board[4][3] = null;
  g.board[2][2].type = "rocketH";
  await g.act([2, 2]);
  assert.equal(g.blocked.get("3,3").hp, 1);
  assert.equal(g.blocked.get("4,3").hp, 2);
});
test("shuffle preserves ids and removes existing matches", () => {
  const g = game();
  const ids = g.board
    .flat()
    .map((p) => p.id)
    .sort((a, b) => a - b);
  g.board[0][0].color = g.board[0][1].color = g.board[0][2].color = 0;
  g.shuffle();
  assert.equal(g.matches().length, 0);
  assert.ok(g.hasMove());
  assert.deepEqual(
    g.board
      .flat()
      .map((p) => p.id)
      .sort((a, b) => a - b),
    ids,
  );
});
