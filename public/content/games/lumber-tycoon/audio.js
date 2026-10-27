// Звук на Web Audio API. Всё идёт через один мастер-канал, который слышно в колонках
// и который же подмешивается в запись видео (streamDest).

export const SOUND_FILES = {
  music: 'sounds/music.mp3',
  saw: 'sounds/saw.mp3',
  logs_fall: 'sounds/logs_fall.mp3',
  logs_scatter: 'sounds/logs_scatter.mp3',
  coins: 'sounds/coins.mp3',
  popup: 'sounds/popup.mp3',
  swoosh: 'sounds/swoosh.mp3',
  upgrade: 'sounds/upgrade.wav',
  splash: 'sounds/splash.mp3',
  fail: 'sounds/fail.mp3',
  horns: 'sounds/horns.mp3',
  truck: 'sounds/truck.wav',
};

export class Sound {
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = new AudioContext();
    this.buffers = {};
    this.last = {};
    this.music = null;
    const c = this.ctx;
    this.master = c.createGain();
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4;
    this.musicBus.connect(comp); this.sfxBus.connect(comp); comp.connect(this.master);
    this.master.connect(c.destination);
    this.streamDest = c.createMediaStreamDestination();
    this.master.connect(this.streamDest);
    this.applyVolumes();
  }
  async load(map) {
    await Promise.all(Object.entries(map).map(async ([k, url]) => {
      try { this.buffers[k] = await this.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer()); }
      catch (e) { console.warn('sound failed', url, e); }
    }));
  }
  get running() { return this.ctx.state === 'running'; }
  applyVolumes() {
    const a = this.cfg.audio;
    this.master.gain.value = a.enabled ? a.master : 0;
    this.musicBus.gain.value = a.music;
    this.sfxBus.gain.value = a.sfx;
  }
  unlock() { if (this.ctx.state === 'suspended') return this.ctx.resume(); return Promise.resolve(); }
  setPaused(p) { if (p) this.ctx.suspend(); else this.ctx.resume(); }

  // opts: vol, rate, offset (sec into file), dur (cut length), delay, throttle (min gap between plays)
  play(name, { vol = 1, rate = 1, offset = 0, dur = 0, delay = 0, throttle = 0, fadeOut = 0.15 } = {}) {
    const buf = this.buffers[name];
    if (!buf || !this.running || !this.cfg.audio.enabled || vol <= 0) return;
    const now = this.ctx.currentTime + delay;
    if (throttle && now - (this.last[name] ?? -1e9) < throttle) return;
    this.last[name] = now;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate;
    g.gain.value = vol;
    src.connect(g).connect(this.sfxBus);
    if (dur) {
      g.gain.setValueAtTime(vol, now + Math.max(0, dur - fadeOut));
      g.gain.linearRampToValueAtTime(0, now + dur);
      src.start(now, offset, dur);
    } else src.start(now, offset);
  }
  playMusic(atSec = 0) {
    this.stopMusic();
    const buf = this.buffers.music;
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.connect(this.musicBus);
    src.start(0, atSec % buf.duration);
    this.music = src;
  }
  stopMusic() { try { this.music?.stop(); } catch { /* already stopped */ } this.music = null; }
}
