const ease = (t) => 1 - Math.pow(1 - t, 3);
// Small stepped corners keep the board consistent with the pixel UI.
function pixelCell(ctx, x, y, w, h) {
  const k = Math.min(3, w / 6, h / 6);
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.lineTo(x + w - k, y + k);
  ctx.lineTo(x + w, y + k);
  ctx.lineTo(x + w, y + h - k);
  ctx.lineTo(x + w - k, y + h - k);
  ctx.lineTo(x + w - k, y + h);
  ctx.lineTo(x + k, y + h);
  ctx.lineTo(x + k, y + h - k);
  ctx.lineTo(x, y + h - k);
  ctx.lineTo(x, y + k);
  ctx.lineTo(x + k, y + k);
  ctx.closePath();
}
export class Renderer {
  constructor(canvas, game, images) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.images = images;
    this.cell = 40;
    this.selected = null;
    this.hint = null;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize();
  }
  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const size = Math.floor(Math.min(box.width, box.height, 440) - 8);
    this.cell = size / Math.max(this.game.stage.rows, this.game.stage.cols);
    this.width = this.cell * this.game.stage.cols;
    this.height = this.cell * this.game.stage.rows;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.draw();
  }
  image(p) {
    return this.images[p.type ?? `fruit${p.color}`];
  }
  sprite(p, x, y, scale = 1, alpha = 1, rotation = 0) {
    const ctx = this.ctx,
      img = this.image(p);
    if (!img) return;
    const side = this.cell * 0.84 * scale;
    const ratio = img.width / img.height;
    const w = ratio > 1 ? side : side * ratio,
      h = ratio > 1 ? side / ratio : side;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation + (p.type === "rocketV" ? Math.PI / 2 : 0));
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  point(at) {
    return [(at[1] + 0.5) * this.cell, (at[0] + 0.5) * this.cell];
  }
  draw(options = {}) {
    const ctx = this.ctx,
      s = this.cell;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    if (options.shake)
      ctx.translate(
        Math.sin(options.time * 60) * options.shake,
        Math.cos(options.time * 75) * options.shake,
      );
    for (let r = 0; r < this.game.stage.rows; r++)
      for (let c = 0; c < this.game.stage.cols; c++) {
        if (!this.game.inside(r, c)) continue;
        ctx.fillStyle = (r + c) % 2 ? "#f6dfbb" : "#ffedce";
        ctx.beginPath();
        pixelCell(ctx, c * s + 1, r * s + 1, s - 2, s - 2);
        ctx.fill();
        const o = this.game.blocked.get(`${r},${c}`);
        if (o) {
          this.sprite({ type: o.type }, (c + 0.5) * s, (r + 0.5) * s);
          ctx.fillStyle = "#fff9e9";
          ctx.beginPath();
          ctx.arc((c + 0.8) * s, (r + 0.8) * s, s * 0.14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#66533f";
          ctx.font = `bold ${s * 0.21}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(o.hp, (c + 0.8) * s, (r + 0.875) * s);
        }
      }
    for (let r = 0; r < this.game.stage.rows; r++)
      for (let c = 0; c < this.game.stage.cols; c++) {
        const p = this.game.board[r][c];
        if (!p) continue;
        if (options.hidden?.has(p.id)) continue;
        let x = (c + 0.5) * s,
          y = (r + 0.5) * s;
        const drop = options.drops?.find((d) => d.id === p.id);
        if (drop) {
          const t = options.t;
          y =
            (drop.from + (drop.to - drop.from) * ease(t) + 0.5) * s +
            Math.sin(t * Math.PI * 3) * s * 0.12 * (t > 0.7 ? 1 : 0);
        }
        this.sprite(p, x, y);
      }
    if (this.selected || this.hint) {
      ctx.strokeStyle = "#ec9abb";
      ctx.lineWidth = 3;
      for (const at of this.hint ?? [this.selected]) {
        ctx.beginPath();
        pixelCell(ctx, at[1] * s + 2, at[0] * s + 2, s - 4, s - 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  animate(duration, frame) {
    return new Promise((resolve) => {
      let start;
      const step = (now) => {
        start ??= now;
        const t = Math.min(
          1,
          (now - start) / (this.reduced ? Math.min(duration, 80) : duration),
        );
        frame(t);
        if (t < 1) requestAnimationFrame(step);
        else {
          this.draw();
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }
  async event(e) {
    this.hint = null;
    const s = this.cell;
    if (e.kind === "swap") {
      const pa = this.game.board[e.b[0]][e.b[1]],
        pb = this.game.board[e.a[0]][e.a[1]];
      await this.animate(200, (t) => {
        this.draw({ hidden: new Set([pa.id, pb.id]) });
        const [ax, ay] = this.point(e.a),
          [bx, by] = this.point(e.b);
        this.sprite(pa, ax + (bx - ax) * ease(t), ay + (by - ay) * ease(t));
        this.sprite(pb, bx + (ax - bx) * ease(t), by + (ay - by) * ease(t));
      });
    }
    if (e.kind === "fall")
      await this.animate(360, (t) => this.draw({ drops: e.drops, t }));
    if (e.kind === "shuffle")
      await this.animate(300, (t) => {
        this.draw();
        this.banner("シャッフル！", t);
      });
    if (e.kind === "clear") {
      await this.animate(e.effects.length ? 650 : 270, (t) => {
        this.draw({
          shake:
            e.effects.some((x) => x.type === "tnt" || x.type === "combo") &&
            !this.reduced
              ? (1 - t) * 3
              : 0,
          time: t,
        });
        for (const { r, c, p } of e.removed) {
          const [x, y] = this.point([r, c]);
          this.sprite(p, x, y, 1 - t, 1 - t);
          this.spark(x, y, t, 8);
        }
        for (const f of e.effects) this.effect(f, t);
        if (e.chain > 1) this.banner(`${e.chain} COMBO!`, t);
      });
    }
  }
  spark(x, y, t, count = 16) {
    const ctx = this.ctx;
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count;
      ctx.fillStyle = i % 2 ? "#ffe791" : "#fffdf1";
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(angle) * this.cell * t * 1.2,
        y + Math.sin(angle) * this.cell * t * 1.2 + this.cell * t * t,
        0.5 + this.cell * 0.07 * (1 - t),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  effect(f, t) {
    const ctx = this.ctx,
      [x, y] = this.point(f.at),
      s = this.cell;
    ctx.save();
    ctx.globalAlpha = 1 - t * 0.8;
    ctx.strokeStyle = "#fff4aa";
    ctx.lineWidth = 5 * (1 - t) + 1;
    ctx.shadowColor = "#ffc867";
    ctx.shadowBlur = 14;
    if (f.type.startsWith("rocket")) {
      const h = f.type === "rocketH";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(h ? x + t * this.width : x, h ? y : y + t * this.height);
      ctx.moveTo(x, y);
      ctx.lineTo(h ? x - t * this.width : x, h ? y : y - t * this.height);
      ctx.stroke();
      for (const sign of [-1, 1]) {
        const xx = h ? x + sign * t * this.width : x,
          yy = h ? y : y + sign * t * this.height;
        this.sprite({ type: f.type }, xx, yy, 1);
        this.spark(xx, yy, t, 8);
      }
    } else if (f.type === "propeller") {
      const [tx, ty] = this.point(f.target ?? f.at);
      const flight = ease(Math.max(0, (t - 0.2) / 0.8));
      this.sprite(
        { type: "propeller" },
        x + (tx - x) * flight,
        y + (ty - y) * flight - Math.sin(flight * Math.PI) * s * 2,
        1,
        1,
        t * 20,
      );
      if (t > 0.7) this.spark(tx, ty, (t - 0.7) / 0.3, 16);
    } else if (f.type === "rainbow") {
      for (const at of f.targets ?? []) {
        const [tx, ty] = this.point(at);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(
          (x + tx) / 2,
          y - s * 2,
          x + (tx - x) * ease(t),
          y + (ty - y) * ease(t),
        );
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, s * (f.type === "combo" ? 4 : 2.5) * t, 0, Math.PI * 2);
      ctx.stroke();
      this.spark(x, y, t, 24);
    }
    ctx.restore();
  }
  banner(text, t) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.sin(t * Math.PI);
    ctx.font = `900 ${Math.max(22, this.cell * 0.7)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "#917156";
    ctx.lineWidth = 5;
    ctx.fillStyle = "#fff5c0";
    ctx.strokeText(text, this.width / 2, this.height / 2);
    ctx.fillText(text, this.width / 2, this.height / 2);
    ctx.restore();
  }
  async celebrate() {
    await this.animate(1100, (t) => {
      this.draw();
      for (let i = 0; i < 8; i++)
        this.spark(
          this.width * (((i * 37) % 100) / 100),
          this.height * (((i * 19) % 60) / 100),
          Math.max(0, (t - i * 0.04) / (1 - i * 0.04)),
          18,
        );
      this.banner("CLEAR!", t);
    });
  }
}
