import "./style.css";
import { Game } from "./engine.js";
import { stages, characters } from "./stages.js";
import { load, save } from "./save.js";
import { Renderer } from "./renderer.js";
import { AudioPlayer } from "./audio.js";
import { paths } from "./assets.js";
import {
  MAP_PADS,
  TITLE_CHARACTERS,
  coverGeometry,
  projectPoint,
} from "./layout.js";
const app = document.querySelector("#app");
const data = load();
const audio = new AudioPlayer(data.settings);
const images = {};
let game,
  renderer,
  busy = false,
  screen = "title",
  resizeObserver;
let saveWarning = false;
for (const name of ["title", "map", "puzzle"])
  app.style.setProperty(
    `--${name}-bg`,
    `url("${new URL(paths[name], document.baseURI).href}")`,
  );
function layoutScreen() {
  const geometry = coverGeometry(app.clientWidth, app.clientHeight);
  app.style.setProperty(
    "--scene-size",
    `${geometry.width}px ${geometry.height}px`,
  );
  app.style.setProperty("--scene-x", `${geometry.x}px`);
  app.style.setProperty("--scene-y", `${geometry.y}px`);
  document.documentElement.style.setProperty(
    "--current-bg",
    `url("${new URL(paths[screen === "collection" ? "map" : screen], document.baseURI).href}")`,
  );
  if (screen === "map") {
    for (const pad of MAP_PADS) {
      const node = app.querySelector(`[data-stage="${pad.id}"]`);
      if (!node) continue;
      const point = projectPoint(pad, geometry);
      node.style.left = `${point.x}px`;
      node.style.top = `${point.y}px`;
      node.style.width = `${Math.max(44, pad.width * geometry.scale)}px`;
      node.style.height = `${Math.max(44, pad.height * geometry.scale)}px`;
    }
  }
  if (screen === "title") {
    const controls = app.querySelector(".title-actions");
    if (!controls) return;
    const safeBottom =
      parseFloat(getComputedStyle(app).getPropertyValue("--safe-bottom")) || 0;
    const heroBottom = projectPoint(
      { x: 0, y: TITLE_CHARACTERS.y + TITLE_CHARACTERS.height },
      geometry,
    ).y;
    const preferred = projectPoint({ x: 0, y: 1170 }, geometry).y;
    const latest = app.clientHeight - safeBottom - controls.offsetHeight - 12;
    controls.style.top = `${Math.min(latest, Math.max(heroBottom + 10, preferred))}px`;
  }
}
function syncViewport() {
  // visualViewport follows Safari's moving toolbar; standalone uses the same path.
  const height = Math.ceil(window.visualViewport?.height ?? window.innerHeight);
  document.documentElement.style.setProperty(
    "--viewport-height",
    `${height}px`,
  );
  layoutScreen();
  if (screen === "puzzle" && renderer && !busy) renderer.resize();
}
window.addEventListener("resize", syncViewport);
window.visualViewport?.addEventListener("resize", syncViewport);
syncViewport();
function persist() {
  if (!save(data) && !saveWarning) {
    saveWarning = true;
    toast("保存できません。Safariのストレージ設定をご確認ください。");
  }
}
function toast(text) {
  document.querySelector(".toast")?.remove();
  const e = document.createElement("div");
  e.className = "toast";
  e.textContent = text;
  app.append(e);
  setTimeout(() => e.remove(), 3500);
}
function button(text, action, cls = "") {
  return `<button data-action="${action}" class="${cls}">${text}</button>`;
}
function mount(html, name) {
  resizeObserver?.disconnect();
  screen = name;
  app.innerHTML =
    html + '<div class="rotate">📱<br>iPhoneを縦向きにして遊んでね</div>';
  layoutScreen();
  app.querySelectorAll("[data-action]").forEach((el) =>
    el.addEventListener("click", () => {
      audio.unlock();
      actions[el.dataset.action]?.();
    }),
  );
}
function settings() {
  return `<div class="settings">${button(`♪ BGM ${data.settings.bgm ? "ON" : "OFF"}`, "bgm")}${button(`♫ 効果音 ${data.settings.sfx ? "ON" : "OFF"}`, "sfx")}</div>`;
}
function title() {
  mount(
    `<section class="screen title"><div class="logo"><div class="eyebrow">POCKET PUZZLE FOREST</div><h1>ぽけっと<br>パズルの森</h1><p>つなげて そだてる ふしぎな島</p></div><img class="mascot" src="${paths.mochi}" alt="もち">${settings()}<div class="title-actions">${button("はじめる", "map", "primary title-start")}<p class="install-tip">Safariの共有から「ホーム画面に追加」</p></div></section>`,
    "title",
  );
}
function map() {
  const next = Math.min(3, Math.max(0, ...data.cleared) + 1);
  mount(
    `<section class="screen map"><header class="topbar">${button("‹", "title", "small")}<h2>こもれびの森</h2><span class="coin">◆ ${data.coins}</span></header><div class="map-path">${stages
      .map((s) => {
        const cleared = data.cleared.includes(s.id),
          locked = s.id > next;
        return `<button class="stage-node ${cleared ? "done" : s.id === next ? "next" : ""}" data-stage="${s.id}" ${locked ? "disabled" : ""} aria-label="ステージ${s.id}${locked ? " 未解放" : cleared ? " クリア済み" : ""}"><span class="stage-number">${s.id}</span><small>${cleared ? "★" : locked ? "未解放" : "挑戦"}</small></button>`;
      })
      .join(
        "",
      )}</div><div class="panel map-note">果実をつなげて、森のなかまと出会おう。</div>${button("なかまコレクション", "collection", "mint")}</section>`,
    "map",
  );
  app.querySelectorAll("[data-stage]").forEach(
    (b) =>
      (b.onclick = () => {
        audio.unlock();
        const id = Number(b.dataset.stage);
        start(id, data.current?.id === id);
      }),
  );
}
function collection() {
  mount(
    `<section class="screen collection"><header class="topbar">${button("‹ マップ", "map", "small")}<h2>森のなかまたち</h2></header><div class="characters">${characters
      .map(([n, label, level]) => {
        const unlocked = data.unlocked.includes(n);
        return `<article class="panel character ${unlocked ? "" : "locked"}"><img src="${paths[n]}" alt="${unlocked ? label : "未解放のなかま"}"><strong>${unlocked ? label : "？？？"}</strong><small>${unlocked ? "森のなかま" : `ステージ${level}クリアで出会えるよ`}</small></article>`;
      })
      .join(
        "",
      )}</div><p class="hint-text">クリアするたび、島がにぎやかになるね。</p></section>`,
    "collection",
  );
}
function modal(html) {
  const shade = document.createElement("div");
  shade.className = "modal-shade";
  shade.innerHTML = `<div class="panel dialog" role="dialog" aria-modal="true">${html}</div>`;
  app.append(shade);
  shade.querySelectorAll("[data-action]").forEach(
    (b) =>
      (b.onclick = () => {
        audio.unlock();
        actions[b.dataset.action]?.();
      }),
  );
  shade.querySelector("button")?.focus();
}
function start(id, resume = false) {
  busy = false;
  hammer = false;
  game = new Game(stages[id - 1]);
  if (resume && data.current?.id === id) {
    try {
      game.restore(data.current.state);
    } catch {
      toast("前の盤面を読み込めないため、新しい盤面で再開します。");
    }
  }
  mount(
    `<section class="screen puzzle"><header class="topbar">${button("‹ マップ", "leave", "small")}<span class="coin">◆ ${data.coins}</span>${button("あそび方", "help", "small")}</header><div class="panel hud"><div class="level">STAGE ${id}<br><strong>${game.stage.name}</strong></div><div class="moves"><strong id="moves"></strong><span>のこり手数</span></div></div><div class="panel goals" id="goals"></div><div class="board-wrap"><canvas aria-label="マッチ3盤面。隣接する果実をスワイプして交換" role="img"></canvas></div><p class="hint-text">${game.stage.tip}</p><footer class="tools">${button("ヒント", "hint")}${button("ハンマー 20", "hammer")}${button("↻ やりなおす", "retry")}</footer></section>`,
    "puzzle",
  );
  renderer = new Renderer(app.querySelector("canvas"), game, images);
  resizeObserver = new ResizeObserver(() => {
    if (!busy) renderer.resize();
  });
  resizeObserver.observe(app.querySelector(".board-wrap"));
  bindInput();
  updateHUD();
  checkpoint();
  if (game.status() !== "playing") finish();
}
function updateHUD() {
  document.querySelector("#moves").textContent = game.moves;
  document.querySelector("#goals").innerHTML = Object.entries(game.stage.goals)
    .map(
      ([k, n]) =>
        `<span class="goal"><img src="${paths[Number.isNaN(Number(k)) ? k : `fruit${k}`]}" alt="${k === "crate" ? "木箱" : k === "rock" ? "岩" : ["いちご", "青りんご", "バナナ", "ぶどう", "桃"][k]}"><span>${Math.min(n, game.progress[k] ?? 0)}/${n}${(game.progress[k] ?? 0) >= n ? " ✓" : ""}</span></span>`,
    )
    .join("");
}
function checkpoint() {
  data.current = { id: game.stage.id, state: game.snapshot() };
  persist();
}
let hammer = false;
function bindInput() {
  const canvas = renderer.canvas;
  let down = null;
  const coord = (e) => {
    const rect = canvas.getBoundingClientRect(),
      border = canvas.clientLeft;
    return [
      Math.floor(
        ((e.clientY - rect.top - border) / (rect.height - border * 2)) *
          game.stage.rows,
      ),
      Math.floor(
        ((e.clientX - rect.left - border) / (rect.width - border * 2)) *
          game.stage.cols,
      ),
    ];
  };
  canvas.onpointerdown = (e) => {
    if (busy || document.querySelector(".modal-shade")) return;
    e.preventDefault();
    audio.unlock();
    down = { at: coord(e), x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointercancel = () => {
    down = null;
  };
  canvas.onpointerup = (e) => {
    if (!down || busy) return;
    e.preventDefault();
    const at = down.at,
      dx = e.clientX - down.x,
      dy = e.clientY - down.y;
    down = null;
    if (!game.inside(...at)) return;
    if (hammer) {
      useHammer(at);
      return;
    }
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
      const dest =
        Math.abs(dx) > Math.abs(dy)
          ? [at[0], at[1] + Math.sign(dx)]
          : [at[0] + Math.sign(dy), at[1]];
      perform(at, dest);
    } else if (game.board[at[0]][at[1]]?.type) perform(at);
    else if (renderer.selected) {
      const previous = renderer.selected;
      renderer.selected = null;
      perform(previous, at);
    } else {
      renderer.selected = at;
      renderer.draw();
    }
  };
}
async function perform(a, b) {
  if (busy) return;
  busy = true;
  renderer.selected = null;
  try {
    await game.act(a, b, async (e) => {
      audio.effect(e.kind === "clear" ? "clear" : "swap");
      await renderer.event(e);
      updateHUD();
    });
    checkpoint();
    if (game.status() !== "playing") await finish();
  } catch (e) {
    console.error(e);
    checkpoint();
    modal(
      `<h2>ひと休みしよう</h2><p>盤面の処理で問題が起きました。保存済みの進行からやりなおせます。</p>${button("やりなおす", "restart")}`,
    );
  } finally {
    busy = false;
    renderer.resize();
  }
}
async function finish() {
  if (game.status() === "won") {
    const id = game.stage.id;
    const first = !data.cleared.includes(id);
    if (first) {
      data.cleared.push(id);
      data.coins += 60;
      data.unlocked = characters
        .filter(([, , n]) => n === 0 || data.cleared.includes(n))
        .map(([n]) => n);
    }
    data.current = null;
    persist();
    audio.effect("win");
    await renderer.celebrate();
    modal(
      `<img src="${paths[characters.find(([, , n]) => n === id)?.[0] ?? "mochi"]}" alt="森のなかま"><h2>ステージクリア！</h2><p>${first ? "なかまが増えたよ！<br>60コインをもらいました。" : "また遊んでくれてありがとう！"}</p>${button("マップへ", "map", "primary")}${button("なかまを見る", "collection", "mint")}`,
    );
  } else {
    data.current = null;
    persist();
    modal(
      `<h2>あともう少し！</h2><p>森のなかまたちも応援しているよ。<br>新しい盤面でチャレンジしよう。</p>${button("もう一度", "restart", "primary")}${button("マップへ", "map")}`,
    );
  }
}
function help() {
  if (busy) return;
  modal(
    `<h2>森のあそび方</h2><p>果実をスワイプ／2回タップして交換。<br>3つ以上で消えるよ。無効な交換は手数を使わないよ。<br>4直線→ロケット ／ L・T字→TNT<br>2×2→プロペラ ／ 5直線→レインボー<br>特殊はタップ、または隣と交換で発動。<br>特殊同士を交換すると大きな力に！<br>木箱は隣接消去、岩は特殊効果で壊そう。</p>${button("わかった！", "close", "primary")}`,
  );
}
function hint() {
  if (busy) return;
  for (let r = 0; r < game.stage.rows; r++)
    for (let c = 0; c < game.stage.cols; c++) {
      if (game.board[r][c]?.type) {
        renderer.hint = [[r, c]];
        renderer.draw();
        return;
      }
      for (const b of [
        [r + 1, c],
        [r, c + 1],
      ])
        if (game.playable(...b) && game.board[r][c] && game.board[b[0]][b[1]]) {
          game.swap([r, c], b);
          const yes = game.matches().length;
          game.swap([r, c], b);
          if (yes) {
            renderer.hint = [[r, c], b];
            renderer.draw();
            return;
          }
        }
    }
}
async function useHammer(at) {
  hammer = false;
  if (data.coins < 20) return;
  const p = game.board[at[0]][at[1]];
  const o = game.blocked.get(at.join(","));
  if (!p && !o) return;
  busy = true;
  data.coins -= 20;
  try {
    await game.act(at, null, (e) => renderer.event(e), true);
    updateHUD();
    checkpoint();
    document.querySelector(".coin").textContent = `◆ ${data.coins}`;
    if (game.status() !== "playing") await finish();
  } finally {
    busy = false;
  }
}
const actions = {
  title,
  map,
  collection,
  bgm: () => {
    data.settings.bgm = !data.settings.bgm;
    persist();
    title();
  },
  sfx: () => {
    data.settings.sfx = !data.settings.sfx;
    persist();
    title();
  },
  leave: () => {
    if (busy) return;
    hammer = false;
    checkpoint();
    map();
  },
  help,
  close: () => document.querySelector(".modal-shade")?.remove(),
  hint,
  hammer: () => {
    if (busy) return;
    if (data.coins < 20) {
      toast("ハンマーには20コイン必要です。クリアして集めよう！");
      return;
    }
    hammer = !hammer;
    toast(
      hammer
        ? "消したいマスをタップ。もう一度ボタンでキャンセル。"
        : "キャンセルしました。",
    );
  },
  retry: () => {
    if (busy) return;
    modal(
      `<h2>やりなおす？</h2><p>このステージを新しい盤面で始めます。</p>${button("やりなおす", "restart")}${button("もどる", "close")}`,
    );
  },
  restart: () => {
    hammer = false;
    start(game.stage.id);
  },
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) audio.ctx?.suspend();
  else audio.ctx?.resume();
});
async function boot() {
  try {
    await Promise.all(
      Object.entries(paths).map(
        ([k, path]) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              images[k] = img;
              resolve();
            };
            img.onerror = () => reject(Error(path));
            img.src = path;
          }),
      ),
    );
    title();
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("./sw.js");
        navigator.serviceWorker.ready.then(() => {
          const tip = app.querySelector(".install-tip");
          if (tip) tip.textContent = "オフライン準備OK・Safariの共有から追加";
        });
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              toast("新しい森の準備ができました。次回起動で更新されます。");
          });
        });
      } catch (error) {
        console.error(error);
        toast("オフライン準備に失敗しました。接続して再読み込みしてください。");
      }
    }
  } catch (error) {
    console.error(error);
    app.innerHTML =
      '<div class="screen"><div class="panel"><h2>森を読み込めませんでした</h2><p>初回は通信が必要です。接続を確認して再読み込みしてください。</p><button onclick="location.reload()">再読み込み</button></div></div>';
  }
}
boot();
