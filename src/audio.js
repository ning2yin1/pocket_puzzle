export class AudioPlayer {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.timer = null;
    this.note = 0;
  }
  unlock() {
    try {
      this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.resume();
      if (!this.timer)
        this.timer = setInterval(() => {
          if (document.hidden || !this.settings.bgm) return;
          this.tone(
            [261.6, 329.6, 392, 329.6, 293.7, 349.2, 440, 349.2][
              this.note++ % 8
            ],
            0.3,
            0.025,
            "sine",
          );
        }, 420);
    } catch {}
  }
  tone(freq, duration = 0.12, volume = 0.08, type = "triangle") {
    if (!this.ctx || this.ctx.state !== "running") return;
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain(),
      t = this.ctx.currentTime;
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + duration + 0.02);
  }
  effect(kind) {
    if (!this.settings.sfx) return;
    this.tone(kind === "clear" ? 660 : kind === "win" ? 880 : 440, 0.18, 0.07);
  }
}
