export const SAVE_KEY = "pocket-puzzle-save";
export const fresh = () => ({
  version: 1,
  cleared: [],
  unlocked: ["mochi"],
  coins: 0,
  settings: { bgm: true, sfx: true },
  current: null,
});
export function load(storage = globalThis.localStorage) {
  try {
    const s = JSON.parse(storage.getItem(SAVE_KEY));
    if (!s || s.version !== 1) return fresh();
    return {
      version: 1,
      cleared: Array.isArray(s.cleared)
        ? [...new Set(s.cleared.filter((n) => [1, 2, 3].includes(n)))]
        : [],
      unlocked: Array.isArray(s.unlocked)
        ? s.unlocked.filter((n) =>
            [
              "mochi",
              "piyo",
              "midorin",
              "pinku",
              "kuromaru",
              "fuwari",
            ].includes(n),
          )
        : ["mochi"],
      coins: Number.isSafeInteger(s.coins) && s.coins >= 0 ? s.coins : 0,
      settings: {
        bgm: typeof s.settings?.bgm === "boolean" ? s.settings.bgm : true,
        sfx: typeof s.settings?.sfx === "boolean" ? s.settings.sfx : true,
      },
      current:
        s.current && [1, 2, 3].includes(s.current.id) && s.current.state
          ? s.current
          : null,
    };
  } catch {
    return fresh();
  }
}
export function save(data, storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
