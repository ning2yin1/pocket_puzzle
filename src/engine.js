export const TYPES = ["rocketH", "rocketV", "tnt", "propeller", "rainbow"];
export const key = (r, c) => `${r},${c}`;
export class Game {
  constructor(stage, rng = Math.random) {
    this.stage = stage;
    this.rng = rng;
    this.nextId = 1;
    this.moves = stage.moves;
    this.progress = {};
    this.turn = 0;
    this.board = Array.from({ length: stage.rows }, () =>
      Array(stage.cols).fill(null),
    );
    this.blocked = new Map(
      stage.obstacles.map((o) => [key(o.r, o.c), { ...o }]),
    );
    this.mask = stage.mask;
    this.initialize();
  }
  cell(color = null, type = null) {
    return {
      id: this.nextId++,
      color: color ?? Math.floor(this.rng() * 5),
      type,
    };
  }
  inside(r, c) {
    return (
      r >= 0 &&
      c >= 0 &&
      r < this.stage.rows &&
      c < this.stage.cols &&
      (!this.mask || this.mask[r][c])
    );
  }
  playable(r, c) {
    return this.inside(r, c) && !this.blocked.has(key(r, c));
  }
  initialize() {
    for (let r = 0; r < this.stage.rows; r++)
      for (let c = 0; c < this.stage.cols; c++)
        if (this.playable(r, c)) {
          let colors = [0, 1, 2, 3, 4].filter(
            (x) =>
              !(
                c > 1 &&
                this.board[r][c - 1]?.color === x &&
                this.board[r][c - 2]?.color === x
              ) &&
              !(
                r > 1 &&
                this.board[r - 1][c]?.color === x &&
                this.board[r - 2][c]?.color === x
              ) &&
              !(
                r > 0 &&
                c > 0 &&
                this.board[r - 1][c]?.color === x &&
                this.board[r][c - 1]?.color === x &&
                this.board[r - 1][c - 1]?.color === x
              ),
          );
          this.board[r][c] = this.cell(
            colors[Math.floor(this.rng() * colors.length)],
          );
        }
    for (const s of this.stage.specials ?? [])
      this.board[s.r][s.c] = this.cell(0, s.type);
    if (!this.hasMove()) this.shuffle();
  }
  matches() {
    const runs = [];
    for (let r = 0; r < this.stage.rows; r++)
      for (let c = 0; c < this.stage.cols; c++) {
        const p = this.board[r][c];
        if (!p || p.type) continue;
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ]) {
          const prev = this.board[r - dr]?.[c - dc];
          if (prev && !prev.type && prev.color === p.color) continue;
          let cells = [];
          for (let y = r, x = c; this.inside(y, x); y += dr, x += dc) {
            const q = this.board[y][x];
            if (!q || q.type || q.color !== p.color) break;
            cells.push([y, x]);
          }
          if (cells.length >= 3) runs.push({ cells, axis: dc ? "h" : "v" });
        }
      }
    // Merge intersecting runs; squares create propellers even without a line.
    const groups = [];
    for (const run of runs) {
      let overlaps = groups.filter((g) =>
        run.cells.some(([r, c]) => g.cells.has(key(r, c))),
      );
      let g = overlaps.shift() ?? { cells: new Set(), runs: [] };
      for (const other of overlaps) {
        for (const k of other.cells) g.cells.add(k);
        g.runs.push(...other.runs);
        groups.splice(groups.indexOf(other), 1);
      }
      for (const [r, c] of run.cells) g.cells.add(key(r, c));
      g.runs.push(run);
      if (!groups.includes(g)) groups.push(g);
    }
    for (let r = 0; r < this.stage.rows - 1; r++)
      for (let c = 0; c < this.stage.cols - 1; c++) {
        const coords = [
            [r, c],
            [r + 1, c],
            [r, c + 1],
            [r + 1, c + 1],
          ],
          p = this.board[r][c];
        if (
          p &&
          !p.type &&
          coords.every(
            ([y, x]) =>
              this.board[y][x] &&
              !this.board[y][x].type &&
              this.board[y][x].color === p.color,
          )
        ) {
          const keys = coords.map(([y, x]) => key(y, x));
          let g = groups.find((g) => keys.some((k) => g.cells.has(k)));
          if (!g) {
            g = { cells: new Set(), runs: [] };
            groups.push(g);
          }
          keys.forEach((k) => g.cells.add(k));
          g.square = true;
        }
      }
    return groups;
  }
  swap(a, b) {
    [this.board[a[0]][a[1]], this.board[b[0]][b[1]]] = [
      this.board[b[0]][b[1]],
      this.board[a[0]][a[1]],
    ];
  }
  hasMove() {
    for (let r = 0; r < this.stage.rows; r++)
      for (let c = 0; c < this.stage.cols; c++) {
        if (!this.board[r][c]) continue;
        if (this.board[r][c].type) return true;
        for (const b of [
          [r + 1, c],
          [r, c + 1],
        ])
          if (this.playable(...b) && this.board[b[0]][b[1]]) {
            this.swap([r, c], b);
            const yes = this.matches().length > 0;
            this.swap([r, c], b);
            if (yes) return true;
          }
      }
    return false;
  }
  shuffle() {
    for (let i = 0; i < 200; i++) {
      const cells = [];
      for (let r = 0; r < this.stage.rows; r++)
        for (let c = 0; c < this.stage.cols; c++)
          if (this.playable(r, c)) cells.push([r, c]);
      const pieces = cells.map(([r, c]) => this.board[r][c] ?? this.cell());
      for (let j = pieces.length - 1; j > 0; j--) {
        const k = Math.floor(this.rng() * (j + 1));
        [pieces[j], pieces[k]] = [pieces[k], pieces[j]];
      }
      cells.forEach(([r, c], i) => (this.board[r][c] = pieces[i]));
      if (!this.matches().length && this.hasMove()) return;
    }
    throw new Error("盤面を作れません。もう一度お試しください。");
  }
  complete() {
    return Object.entries(this.stage.goals).every(
      ([k, n]) => (this.progress[k] ?? 0) >= n,
    );
  }
  status() {
    return this.complete() ? "won" : this.moves <= 0 ? "lost" : "playing";
  }
  add(k, n = 1) {
    this.progress[k] = (this.progress[k] ?? 0) + n;
  }
  dominant() {
    const counts = [0, 0, 0, 0, 0];
    this.board.flat().forEach((p) => {
      if (p && !p.type) counts[p.color]++;
    });
    return counts.indexOf(Math.max(...counts));
  }
  target(exclude = new Set()) {
    const blocks = [...this.blocked.values()]
      .filter((o) => !exclude.has(key(o.r, o.c)))
      .sort(
        (a, b) =>
          (this.stage.goals[b.type] ?? 0) -
          (this.progress[b.type] ?? 0) -
          ((this.stage.goals[a.type] ?? 0) - (this.progress[a.type] ?? 0)),
      );
    if (blocks.length) return [blocks[0].r, blocks[0].c];
    for (let r = 0; r < this.stage.rows; r++)
      for (let c = 0; c < this.stage.cols; c++) {
        const p = this.board[r][c];
        if (
          p &&
          !exclude.has(key(r, c)) &&
          (this.stage.goals[p.color] ?? 0) > (this.progress[p.color] ?? 0)
        )
          return [r, c];
      }
    return [
      Math.floor(this.rng() * this.stage.rows),
      Math.floor(this.rng() * this.stage.cols),
    ];
  }
  async act(a, b, emit = async () => {}, boost = false) {
    if (this.status() !== "playing" || (!boost && !this.board[a[0]]?.[a[1]]))
      return false;
    const p = boost ? { type: "hammer" } : this.board[a[0]][a[1]],
      q = b ? this.board[b[0]]?.[b[1]] : null;
    if (b && (!q || Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1))
      return false;
    if (!b && !p.type) return false;
    if (b) {
      this.swap(a, b);
      await emit({ kind: "swap", a, b });
    }
    let groups = this.matches();
    if (!p.type && !q?.type && !groups.length) {
      if (b) {
        this.swap(a, b);
        await emit({ kind: "swap", a, b, invalid: true });
      }
      return false;
    }
    if (!boost) this.moves--;
    this.turn++;
    let seeds = [];
    let combo = null;
    if (p.type || q?.type) {
      if (p.type && q?.type) combo = { a, b, p, q };
      else {
        const at = p.type ? (b ?? a) : a;
        const special = p.type ? p : q;
        seeds = [{ at, type: special.type, color: (p.type ? q : p)?.color }];
      }
    }
    let chain = 0;
    do {
      if (++chain > 80) {
        this.shuffle();
        await emit({ kind: "shuffle" });
        break;
      }
      const hits = new Set(),
        direct = new Set(),
        created = new Map(),
        effects = [],
        consumed = new Set();
      const hit = (r, c, d = true) => {
        if (this.inside(r, c)) {
          hits.add(key(r, c));
          if (d) direct.add(key(r, c));
        }
      };
      const area = (r, c, n) => {
        for (let y = r - n; y <= r + n; y++)
          for (let x = c - n; x <= c + n; x++) hit(y, x);
      };
      const line = (r, c, type, width = 0) => {
        for (let offset = -width; offset <= width; offset++) {
          if (type === "rocketH")
            for (let x = 0; x < this.stage.cols; x++) hit(r + offset, x);
          else for (let y = 0; y < this.stage.rows; y++) hit(y, c + offset);
        }
      };
      const queue = [...seeds];
      seeds = [];
      if (combo) {
        const { a: aa, b: bb, p: pp, q: qq } = combo;
        hit(...aa);
        hit(...bb);
        consumed.add(key(...aa));
        consumed.add(key(...bb));
        effects.push({ type: "combo", at: bb });
        const ts = [pp.type, qq.type];
        if (ts.includes("rainbow")) {
          const other = ts.find((t) => t !== "rainbow");
          if (!other) {
            const targets = [];
            for (let r = 0; r < this.stage.rows; r++)
              for (let c = 0; c < this.stage.cols; c++) {
                hit(r, c);
                targets.push([r, c]);
              }
            effects.push({ type: "rainbow", at: bb, targets });
          } else {
            const color = this.dominant(),
              targets = [];
            for (let r = 0; r < this.stage.rows; r++)
              for (let c = 0; c < this.stage.cols; c++)
                if (
                  this.board[r][c]?.color === color &&
                  !consumed.has(key(r, c))
                ) {
                  this.board[r][c].type = other;
                  targets.push([r, c]);
                  queue.push({ at: [r, c], type: other });
                }
            effects.push({ type: "rainbow", at: bb, targets });
          }
        } else if (ts.includes("propeller")) {
          hit(bb[0] - 1, bb[1]);
          hit(bb[0] + 1, bb[1]);
          hit(bb[0], bb[1] - 1);
          hit(bb[0], bb[1] + 1);
          const other = ts.find((t) => t !== "propeller") ?? "propeller";
          for (let i = 0; i < (other === "propeller" ? 3 : 1); i++) {
            const dest = this.target(hits);
            effects.push({ type: "propeller", at: bb, target: dest });
            if (other === "propeller") hit(...dest);
            else queue.push({ at: dest, type: other });
          }
        } else if (ts.every((t) => t === "tnt")) area(...bb, 3);
        else if (ts.includes("tnt")) {
          line(...bb, "rocketH", 1);
          line(...bb, "rocketV", 1);
        } else {
          line(...bb, "rocketH");
          line(...bb, "rocketV");
        }
        combo = null;
        groups = [];
      }
      for (const g of groups) {
        for (const k of g.cells) hits.add(k);
        const longest = g.runs.reduce((m, x) => Math.max(m, x.cells.length), 0);
        let type =
          longest >= 5
            ? "rainbow"
            : g.runs.some((x) => x.axis === "h") &&
                g.runs.some((x) => x.axis === "v")
              ? "tnt"
              : longest === 4
                ? g.runs.find((x) => x.cells.length === 4).axis === "h"
                  ? "rocketH"
                  : "rocketV"
                : g.square
                  ? "propeller"
                  : null;
        if (type) {
          const preferred = [b, a]
            .filter(Boolean)
            .map((x) => key(...x))
            .find((k) => g.cells.has(k));
          const k = preferred ?? [...g.cells][Math.floor(g.cells.size / 2)];
          created.set(k, type);
          hits.delete(k);
        }
      }
      const fired = new Set(consumed);
      const activate = (s) => {
        const [r, c] = s.at,
          k = key(r, c);
        if (fired.has(k)) return;
        fired.add(k);
        hit(r, c);
        effects.push({ type: s.type, at: s.at });
        if (s.type.startsWith("rocket")) line(r, c, s.type);
        else if (s.type === "tnt") area(r, c, 2);
        else if (s.type === "propeller") {
          hit(r - 1, c);
          hit(r + 1, c);
          hit(r, c - 1);
          hit(r, c + 1);
          const dest = this.target(hits);
          effects[effects.length - 1].target = dest;
          hit(...dest);
        } else if (s.type === "rainbow") {
          const color = s.color ?? this.dominant();
          const targets = [];
          for (let y = 0; y < this.stage.rows; y++)
            for (let x = 0; x < this.stage.cols; x++)
              if (this.board[y][x]?.color === color) {
                hit(y, x);
                targets.push([y, x]);
              }
          effects[effects.length - 1].targets = targets;
        }
      };
      queue.forEach(activate);
      let more = true;
      while (more) {
        more = false;
        for (const k of [...hits]) {
          const [r, c] = k.split(",").map(Number),
            p = this.board[r][c];
          if (p?.type && !fired.has(k)) {
            activate({ at: [r, c], type: p.type });
            more = true;
          }
        }
      }
      const damaged = new Set();
      for (const k of hits) {
        const [r, c] = k.split(",").map(Number);
        if (direct.has(k) && this.blocked.has(k)) damaged.add(k);
        for (const [y, x] of [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ])
          if (this.blocked.get(key(y, x))?.type === "crate")
            damaged.add(key(y, x));
      }
      const removed = [];
      for (const k of hits) {
        const [r, c] = k.split(",").map(Number),
          p = this.board[r][c];
        if (p) {
          removed.push({ r, c, p: { ...p } });
          if (!p.type) this.add(p.color);
          this.board[r][c] = null;
        }
      }
      for (const k of damaged) {
        const o = this.blocked.get(k);
        if (--o.hp <= 0) {
          this.blocked.delete(k);
          this.add(o.type);
        }
      }
      for (const [k, type] of created) {
        const [r, c] = k.split(",").map(Number);
        if (!direct.has(k)) this.board[r][c] = this.cell(null, type);
      }
      await emit({
        kind: "clear",
        removed,
        effects,
        chain,
        damaged: [...damaged],
      });
      const drops = this.collapse();
      await emit({ kind: "fall", drops, chain });
      groups = this.matches();
      a = null;
      b = null;
    } while (groups.length);
    if (this.status() === "playing" && !this.hasMove()) {
      this.shuffle();
      await emit({ kind: "shuffle" });
    }
    return true;
  }
  collapse() {
    const drops = [];
    for (let c = 0; c < this.stage.cols; c++) {
      let end = this.stage.rows - 1;
      while (end >= 0) {
        if (!this.playable(end, c)) {
          end--;
          continue;
        }
        let start = end;
        while (start > 0 && this.playable(start - 1, c)) start--;
        const pieces = [];
        for (let r = end; r >= start; r--)
          if (this.board[r][c]) pieces.push({ p: this.board[r][c], from: r });
        for (let r = end; r >= start; r--) {
          const found = pieces[end - r];
          const p = found?.p ?? this.cell();
          const from = found?.from ?? start - 1 - (end - r - pieces.length);
          this.board[r][c] = p;
          if (from !== r) drops.push({ id: p.id, c, from, to: r });
        }
        end = start - 1;
      }
    }
    return drops;
  }
  snapshot() {
    return {
      board: this.board,
      blocked: [...this.blocked],
      moves: this.moves,
      progress: this.progress,
      nextId: this.nextId,
      turn: this.turn,
    };
  }
  restore(s) {
    const validCell = (p) =>
      p === null ||
      (p &&
        Number.isSafeInteger(p.id) &&
        p.id > 0 &&
        Number.isInteger(p.color) &&
        p.color >= 0 &&
        p.color < 5 &&
        (p.type === null || TYPES.includes(p.type)));
    if (
      !s ||
      s.board?.length !== this.stage.rows ||
      !s.board.every(
        (row) =>
          Array.isArray(row) &&
          row.length === this.stage.cols &&
          row.every(validCell),
      ) ||
      !Number.isInteger(s.moves) ||
      s.moves < 0 ||
      !Number.isSafeInteger(s.nextId) ||
      !s.progress ||
      !Object.values(s.progress).every((n) => Number.isInteger(n) && n >= 0) ||
      !Array.isArray(s.blocked)
    )
      throw Error("Invalid save");
    const blocked = new Map(s.blocked);
    for (const [k, o] of blocked)
      if (
        !o ||
        !this.inside(o.r, o.c) ||
        k !== key(o.r, o.c) ||
        !["crate", "rock"].includes(o.type) ||
        !Number.isInteger(o.hp) ||
        o.hp <= 0
      )
        throw Error("Invalid obstacle");
    const ids = s.board
      .flat()
      .filter(Boolean)
      .map((p) => p.id);
    if (new Set(ids).size !== ids.length || Math.max(0, ...ids) >= s.nextId)
      throw Error("Invalid ids");
    this.board = s.board;
    this.blocked = blocked;
    this.moves = s.moves;
    this.progress = s.progress;
    this.nextId = s.nextId;
    this.turn = s.turn ?? 0;
  }
}
