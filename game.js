(() => {
  "use strict";

  // ─────────────────────────────────────────────
  // Константы
  // ─────────────────────────────────────────────
  const MAX_BALLOONS = 7;
  const MAX_PARTICLES = 180;
  const MAX_SMALL_BALLOONS = 9;
  const MAX_JELLIES = 4;
  const SPAWN_INTERVAL_MIN = 900;
  const SPAWN_INTERVAL_MAX = 1600;
  const SURPRISE_MIN = 6;
  const SURPRISE_MAX = 10;
  const HINT_DELAY_MS = 4500;
  const FACE_SURPRISE_MS = 5000;
  const RAIN_DURATION_MS = 4000;
  const RAIN_SPAWN_MS = 280;

  const TYPES = {
    RED: "red",
    YELLOW: "yellow",
    BLUE: "blue",
    GREEN: "green",
    RAINBOW: "rainbow",
    GIANT: "giant",
    SMALL: "small",
  };

  const COLORS = {
    red: { main: "#ff4757", dark: "#c0392b", light: "#ff6b81" },
    yellow: { main: "#ffd32a", dark: "#f39c12", light: "#ffeaa7" },
    blue: { main: "#3742fa", dark: "#1e90ff", light: "#70a1ff" },
    green: { main: "#2ed573", dark: "#20bf6b", light: "#7bed9f" },
    purple: { main: "#a55eea", dark: "#8854d0", light: "#d6a2e8" },
    orange: { main: "#ff9f43", dark: "#ee5a24", light: "#feca57" },
    pink: { main: "#ff6b81", dark: "#e84393", light: "#fd79a8" },
    small: { main: "#ffa502", dark: "#e67e22", light: "#ffd32a" },
  };

  const SMART_COLORS = ["red", "yellow", "blue", "green"];

  // ─────────────────────────────────────────────
  // DOM
  // ─────────────────────────────────────────────
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const menuScreen = document.getElementById("menuScreen");
  const hud = document.getElementById("hud");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const smartTarget = document.getElementById("smartTarget");
  const targetBall = document.getElementById("targetBall");
  const scoreValue = document.getElementById("scoreValue");
  const popTextLayer = document.getElementById("popTextLayer");
  const muteIconMenu = document.getElementById("muteIconMenu");
  const muteIconGame = document.getElementById("muteIconGame");

  const btnPlay = document.getElementById("btnPlay");
  const btnSmart = document.getElementById("btnSmart");
  const btnMuteMenu = document.getElementById("btnMuteMenu");
  const btnMuteGame = document.getElementById("btnMuteGame");
  const btnHome = document.getElementById("btnHome");
  const btnPause = document.getElementById("btnPause");
  const btnResume = document.getElementById("btnResume");
  const btnPauseHome = document.getElementById("btnPauseHome");

  // ─────────────────────────────────────────────
  // Состояние
  // ─────────────────────────────────────────────
  const state = {
    mode: "menu", // menu | free | smart
    running: false,
    paused: false,
    muted: false,
    audioReady: false,
    score: 0,
    hitsSinceSurprise: 0,
    nextSurpriseAt: randInt(SURPRISE_MIN, SURPRISE_MAX),
    smartColor: "red",
    lastHitTime: 0,
    hintBalloonId: null,
    faceModeUntil: 0,
    rainUntil: 0,
    w: 0,
    h: 0,
    dpr: 1,
    lastTime: 0,
    spawnTimer: 0,
    rainSpawnTimer: 0,
    rafId: null,
    balloons: [],
    particles: [],
    jellies: [],
    clouds: [],
    nextId: 1,
    smallCount: 0,
  };

  // ─────────────────────────────────────────────
  // Утилиты
  // ─────────────────────────────────────────────
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function pick(arr) {
    return arr[randInt(0, arr.length - 1)];
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function dist(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  // ─────────────────────────────────────────────
  // Звук (Web Audio API)
  // ─────────────────────────────────────────────
  let audioCtx = null;

  function ensureAudio() {
    if (state.audioReady) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      state.audioReady = true;
    } catch (_) {
      state.audioReady = false;
    }
  }

  function resumeAudio() {
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function playTone({ freq = 440, type = "sine", dur = 0.15, vol = 0.18, slide = 0, delay = 0 }) {
    if (state.muted || !state.audioReady || !audioCtx) return;
    try {
      const t0 = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (_) {}
  }

  function playNoise({ dur = 0.12, vol = 0.1, filterFreq = 1200 }) {
    if (state.muted || !state.audioReady || !audioCtx) return;
    try {
      const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filter = audioCtx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = filterFreq;
      filter.Q.value = 0.8;
      const gain = audioCtx.createGain();
      const t0 = audioCtx.currentTime;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (_) {}
  }

  const SFX = {
    pop() {
      playTone({ freq: 520, type: "triangle", dur: 0.12, vol: 0.16, slide: -280 });
      playNoise({ dur: 0.08, vol: 0.07, filterFreq: 1800 });
    },
    boom() {
      playTone({ freq: 120, type: "sine", dur: 0.28, vol: 0.2, slide: -60 });
      playNoise({ dur: 0.2, vol: 0.12, filterFreq: 400 });
      playTone({ freq: 80, type: "triangle", dur: 0.35, vol: 0.12, slide: -30, delay: 0.02 });
    },
    plop() {
      playTone({ freq: 220, type: "sine", dur: 0.22, vol: 0.16, slide: -100 });
      playTone({ freq: 160, type: "triangle", dur: 0.18, vol: 0.1, delay: 0.04 });
    },
    bloop() {
      playTone({ freq: 360, type: "sine", dur: 0.15, vol: 0.14, slide: 180 });
      playTone({ freq: 480, type: "triangle", dur: 0.12, vol: 0.08, delay: 0.05 });
    },
    bounce() {
      playTone({ freq: 300, type: "square", dur: 0.08, vol: 0.08, slide: 120 });
    },
    party() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => {
        playTone({ freq: f, type: "triangle", dur: 0.18, vol: 0.1, delay: i * 0.07 });
      });
      playNoise({ dur: 0.15, vol: 0.06, filterFreq: 2500 });
    },
    split() {
      playTone({ freq: 440, type: "triangle", dur: 0.1, vol: 0.12, slide: 200 });
      playTone({ freq: 660, type: "sine", dur: 0.1, vol: 0.1, delay: 0.05, slide: 100 });
    },
    squash() {
      playTone({ freq: 180, type: "sine", dur: 0.14, vol: 0.12, slide: -80 });
    },
    ui() {
      playTone({ freq: 600, type: "sine", dur: 0.08, vol: 0.1 });
    },
  };

  function updateMuteIcons() {
    const icon = state.muted ? "🔇" : "🔊";
    muteIconMenu.textContent = icon;
    muteIconGame.textContent = icon;
  }

  // ─────────────────────────────────────────────
  // Облака (фон)
  // ─────────────────────────────────────────────
  function initClouds() {
    state.clouds = [];
    const count = Math.max(4, Math.floor(state.w / 280));
    for (let i = 0; i < count; i++) {
      state.clouds.push({
        x: rand(0, state.w),
        y: rand(state.h * 0.05, state.h * 0.45),
        scale: rand(0.7, 1.5),
        speed: rand(8, 22),
        alpha: rand(0.45, 0.75),
      });
    }
  }

  function updateClouds(dt) {
    for (const c of state.clouds) {
      c.x += c.speed * dt;
      if (c.x > state.w + 120) {
        c.x = -120;
        c.y = rand(state.h * 0.05, state.h * 0.5);
      }
    }
  }

  function drawCloud(c) {
    const s = c.scale * 40;
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(c.x, c.y, s * 0.55, 0, Math.PI * 2);
    ctx.arc(c.x + s * 0.55, c.y - s * 0.15, s * 0.7, 0, Math.PI * 2);
    ctx.arc(c.x + s * 1.15, c.y, s * 0.5, 0, Math.PI * 2);
    ctx.arc(c.x + s * 0.5, c.y + s * 0.2, s * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, state.h);
    g.addColorStop(0, "#74d6ff");
    g.addColorStop(0.55, "#a8e6ff");
    g.addColorStop(1, "#dff7ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.w, state.h);

    // мягкие холмы
    ctx.fillStyle = "#8fd46a";
    ctx.beginPath();
    ctx.moveTo(0, state.h);
    ctx.quadraticCurveTo(state.w * 0.2, state.h * 0.82, state.w * 0.4, state.h * 0.88);
    ctx.quadraticCurveTo(state.w * 0.65, state.h * 0.95, state.w, state.h * 0.84);
    ctx.lineTo(state.w, state.h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#7bc95a";
    ctx.beginPath();
    ctx.moveTo(0, state.h);
    ctx.quadraticCurveTo(state.w * 0.3, state.h * 0.9, state.w * 0.55, state.h * 0.93);
    ctx.quadraticCurveTo(state.w * 0.8, state.h * 0.97, state.w, state.h * 0.9);
    ctx.lineTo(state.w, state.h);
    ctx.closePath();
    ctx.fill();
  }

  // ─────────────────────────────────────────────
  // Частицы
  // ─────────────────────────────────────────────
  function addParticle(p) {
    if (state.particles.length >= MAX_PARTICLES) {
      state.particles.splice(0, state.particles.length - MAX_PARTICLES + 1);
    }
    state.particles.push(p);
  }

  function burst(x, y, color, count = 14, speed = 220) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(speed * 0.3, speed);
      addParticle({
        kind: "dot",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rand(40, 120),
        life: rand(0.45, 0.9),
        maxLife: 0.9,
        size: rand(4, 10),
        color,
        rot: rand(0, Math.PI * 2),
        spin: rand(-6, 6),
      });
    }
  }

  function confettiBurst(x, y, count = 40) {
    const palette = ["#ff4757", "#ffd32a", "#3742fa", "#2ed573", "#a55eea", "#ff9f43", "#fff"];
    for (let i = 0; i < count; i++) {
      const a = rand(-Math.PI, 0);
      const sp = rand(120, 420);
      addParticle({
        kind: "confetti",
        x,
        y,
        vx: Math.cos(a) * sp * rand(0.3, 1),
        vy: Math.sin(a) * sp,
        life: rand(1.0, 1.8),
        maxLife: 1.8,
        size: rand(6, 12),
        color: pick(palette),
        rot: rand(0, Math.PI * 2),
        spin: rand(-10, 10),
        w: rand(5, 10),
        h: rand(8, 16),
      });
    }
  }

  function starBurst(x, y, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 200);
      addParticle({
        kind: "star",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 80,
        life: rand(0.6, 1.1),
        maxLife: 1.1,
        size: rand(8, 16),
        color: pick(["#fff36a", "#ffeaa7", "#ffffff", "#ffd32a"]),
        rot: rand(0, Math.PI * 2),
        spin: rand(-4, 4),
      });
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.vy += (p.kind === "confetti" ? 280 : 180) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.rot += p.spin * dt;
    }
  }

  function drawStar(x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of state.particles) {
      const alpha = clamp(p.life / (p.maxLife * 0.4), 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.kind === "confetti") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else if (p.kind === "star") {
        drawStar(p.x, p.y, p.size, p.rot);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ─────────────────────────────────────────────
  // Желейные лужицы
  // ─────────────────────────────────────────────
  function addJelly(x, y, color) {
    while (state.jellies.length >= MAX_JELLIES) {
      state.jellies.shift();
    }
    state.jellies.push({
      x,
      y: Math.min(y + 20, state.h - 30),
      color,
      life: 2.2,
      maxLife: 2.2,
      w: rand(50, 70),
      h: rand(18, 28),
      wobble: rand(0, Math.PI * 2),
    });
  }

  function updateJellies(dt) {
    for (let i = state.jellies.length - 1; i >= 0; i--) {
      const j = state.jellies[i];
      j.life -= dt;
      j.wobble += dt * 4;
      if (j.life <= 0) state.jellies.splice(i, 1);
    }
  }

  function drawJellies() {
    for (const j of state.jellies) {
      const t = j.life / j.maxLife;
      const wob = Math.sin(j.wobble) * 4;
      ctx.globalAlpha = clamp(t * 1.2, 0, 0.85);
      ctx.fillStyle = j.color;
      ctx.beginPath();
      ctx.ellipse(j.x, j.y, j.w / 2 + wob, j.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(j.x - j.w * 0.15, j.y - j.h * 0.15, j.w * 0.2, j.h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ─────────────────────────────────────────────
  // Шарики
  // ─────────────────────────────────────────────
  function baseRadius(type) {
    const minDim = Math.min(state.w, state.h);
    if (type === TYPES.GIANT) return clamp(minDim * 0.16, 70, 110);
    if (type === TYPES.SMALL) return clamp(minDim * 0.055, 28, 40);
    return clamp(minDim * 0.09, 42, 64);
  }

  function createBalloon(opts = {}) {
    const type = opts.type || pickWeightedType();
    const r = opts.r || baseRadius(type);
    const margin = r + 10;
    const x = opts.x != null ? opts.x : rand(margin, state.w - margin);
    const y = opts.y != null ? opts.y : state.h + r + rand(10, 80);
    const speedScale = type === TYPES.GIANT ? 0.55 : type === TYPES.SMALL ? 1.25 : 1;
    const colorKey = opts.colorKey || colorForType(type);

    return {
      id: state.nextId++,
      type,
      colorKey,
      x,
      y,
      r,
      baseR: r,
      vx: opts.vx != null ? opts.vx : rand(-40, 40) * speedScale,
      vy: opts.vy != null ? opts.vy : -rand(45, 95) * speedScale,
      bob: rand(0, Math.PI * 2),
      bobSpeed: rand(1.5, 3),
      rot: rand(-0.15, 0.15),
      squashX: 1,
      squashY: 1,
      hits: 0,
      maxHits: type === TYPES.GIANT ? 3 : type === TYPES.GREEN ? 2 : 1,
      face: randInt(0, 4),
      pulse: 0,
      hint: 0,
      stringLen: r * 1.4,
      alive: true,
      popAnim: 0,
      rainbowHue: rand(0, 360),
      fromSplit: !!opts.fromSplit,
    };
  }

  function colorForType(type) {
    switch (type) {
      case TYPES.RED: return "red";
      case TYPES.YELLOW: return "yellow";
      case TYPES.BLUE: return "blue";
      case TYPES.GREEN: return "green";
      case TYPES.RAINBOW: return "rainbow";
      case TYPES.GIANT: return pick(["purple", "orange", "pink", "red"]);
      case TYPES.SMALL: return "small";
      default: return "red";
    }
  }

  function pickWeightedType() {
    // Радужный реже, гигант — только сюрприз
    const roll = Math.random();
    if (roll < 0.22) return TYPES.RED;
    if (roll < 0.42) return TYPES.YELLOW;
    if (roll < 0.62) return TYPES.BLUE;
    if (roll < 0.82) return TYPES.GREEN;
    return TYPES.RAINBOW;
  }

  function countNormalBalloons() {
    return state.balloons.filter((b) => b.alive && b.type !== TYPES.SMALL).length;
  }

  function spawnBalloon(forcedType) {
    if (state.paused || !state.running) return;
    if (forcedType === TYPES.SMALL) {
      if (state.smallCount >= MAX_SMALL_BALLOONS) return;
    } else if (forcedType !== TYPES.GIANT) {
      if (countNormalBalloons() >= MAX_BALLOONS) return;
    } else if (state.balloons.filter((b) => b.alive).length >= MAX_BALLOONS + 2) {
      return;
    }

    const b = createBalloon({ type: forcedType });
    if (b.type === TYPES.SMALL) state.smallCount++;
    state.balloons.push(b);
  }

  function spawnSmallFrom(parent) {
    const canSpawn = Math.min(3, MAX_SMALL_BALLOONS - state.smallCount);
    for (let i = 0; i < canSpawn; i++) {
      const a = (-Math.PI / 2) + (i - 1) * 0.7;
      const b = createBalloon({
        type: TYPES.SMALL,
        x: parent.x + Math.cos(a) * 20,
        y: parent.y + Math.sin(a) * 20,
        vx: Math.cos(a) * rand(60, 120),
        vy: -rand(80, 140),
        fromSplit: true,
      });
      state.smallCount++;
      state.balloons.push(b);
    }
  }

  function getBalloonColor(b) {
    if (b.colorKey === "rainbow" || b.type === TYPES.RAINBOW) {
      const rgb = hslToRgb(b.rainbowHue, 85, 55);
      return {
        main: `rgb(${rgb.r},${rgb.g},${rgb.b})`,
        dark: `rgb(${Math.floor(rgb.r * 0.7)},${Math.floor(rgb.g * 0.7)},${Math.floor(rgb.b * 0.7)})`,
        light: `rgb(${Math.min(255, rgb.r + 40)},${Math.min(255, rgb.g + 40)},${Math.min(255, rgb.b + 40)})`,
      };
    }
    return COLORS[b.colorKey] || COLORS.red;
  }

  function drawFace(b, scale) {
    const funny = performance.now() < state.faceModeUntil;
    const eyeY = -b.baseR * 0.12 * scale;
    const eyeSpread = b.baseR * 0.22 * scale;
    const eyeR = b.baseR * 0.1 * scale;

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
    ctx.arc(eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2d3436";
    const pupil = eyeR * 0.55;
    const lookX = Math.sin(b.bob) * eyeR * 0.25;
    ctx.beginPath();
    ctx.arc(-eyeSpread + lookX, eyeY + 1, pupil, 0, Math.PI * 2);
    ctx.arc(eyeSpread + lookX, eyeY + 1, pupil, 0, Math.PI * 2);
    ctx.fill();

    // блики
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-eyeSpread - pupil * 0.3, eyeY - pupil * 0.3, pupil * 0.35, 0, Math.PI * 2);
    ctx.arc(eyeSpread - pupil * 0.3, eyeY - pupil * 0.3, pupil * 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#2d3436";
    ctx.lineWidth = Math.max(2, b.baseR * 0.04);
    ctx.lineCap = "round";

    const mouthY = b.baseR * 0.22 * scale;
    ctx.beginPath();
    if (funny) {
      // смешная рожица — широкий рот и язык
      ctx.arc(0, mouthY - 2, b.baseR * 0.22 * scale, 0.15, Math.PI - 0.15);
      ctx.stroke();
      ctx.fillStyle = "#ff6b81";
      ctx.beginPath();
      ctx.ellipse(0, mouthY + b.baseR * 0.12 * scale, b.baseR * 0.1 * scale, b.baseR * 0.08 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.face === 0) {
      ctx.arc(0, mouthY - 4, b.baseR * 0.18 * scale, 0.2, Math.PI - 0.2);
      ctx.stroke();
    } else if (b.face === 1) {
      ctx.moveTo(-b.baseR * 0.15 * scale, mouthY);
      ctx.quadraticCurveTo(0, mouthY + b.baseR * 0.18 * scale, b.baseR * 0.15 * scale, mouthY);
      ctx.stroke();
    } else if (b.face === 2) {
      ctx.arc(0, mouthY + 2, b.baseR * 0.12 * scale, 0, Math.PI * 2);
      ctx.fillStyle = "#2d3436";
      ctx.fill();
    } else if (b.face === 3) {
      ctx.moveTo(-b.baseR * 0.16 * scale, mouthY + 4);
      ctx.quadraticCurveTo(0, mouthY - 6, b.baseR * 0.16 * scale, mouthY + 4);
      ctx.stroke();
    } else {
      ctx.arc(0, mouthY, b.baseR * 0.16 * scale, 0.1, Math.PI - 0.1);
      ctx.stroke();
      // румянец
      ctx.fillStyle = "rgba(255,120,140,0.35)";
      ctx.beginPath();
      ctx.ellipse(-eyeSpread - 4, mouthY - 4, eyeR * 0.9, eyeR * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(eyeSpread + 4, mouthY - 4, eyeR * 0.9, eyeR * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBalloon(b) {
    if (!b.alive) return;
    const col = getBalloonColor(b);
    const pulse = 1 + Math.sin(b.pulse) * 0.03;
    const sx = b.squashX * pulse;
    const sy = b.squashY * pulse;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);

    // ниточка
    ctx.strokeStyle = "rgba(80,80,80,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, b.baseR * sy * 0.95);
    ctx.quadraticCurveTo(
      Math.sin(b.bob) * 8,
      b.baseR * sy + b.stringLen * 0.5,
      Math.sin(b.bob * 1.3) * 4,
      b.baseR * sy + b.stringLen
    );
    ctx.stroke();

    // тень
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(4, 6, b.baseR * sx, b.baseR * sy, 0, 0, Math.PI * 2);
    ctx.fill();

    // тело
    const grad = ctx.createRadialGradient(
      -b.baseR * 0.3 * sx,
      -b.baseR * 0.35 * sy,
      b.baseR * 0.1,
      0,
      0,
      b.baseR * Math.max(sx, sy)
    );
    grad.addColorStop(0, col.light);
    grad.addColorStop(0.55, col.main);
    grad.addColorStop(1, col.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.baseR * sx, b.baseR * sy, 0, 0, Math.PI * 2);
    ctx.fill();

    // блик
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(-b.baseR * 0.28 * sx, -b.baseR * 0.32 * sy, b.baseR * 0.18 * sx, b.baseR * 0.28 * sy, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // узелок
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    ctx.moveTo(-4, b.baseR * sy * 0.92);
    ctx.lineTo(4, b.baseR * sy * 0.92);
    ctx.lineTo(0, b.baseR * sy * 0.92 + 10);
    ctx.closePath();
    ctx.fill();

    drawFace(b, Math.min(sx, sy));

    // подсветка-подсказка
    if (b.hint > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + b.hint * 0.5})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.baseR * sx + 8 + b.hint * 6, b.baseR * sy + 8 + b.hint * 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // радужный ободок
    if (b.type === TYPES.RAINBOW) {
      ctx.strokeStyle = `hsla(${(b.rainbowHue + 180) % 360},90%,70%,0.7)`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.baseR * sx + 3, b.baseR * sy + 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // индикатор ударов для гиганта / зелёного (только в игре и после первого попадания)
    if (state.running && b.maxHits > 1 && b.hits > 0) {
      const left = b.maxHits - b.hits;
      for (let i = 0; i < left; i++) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc((i - (left - 1) / 2) * 12, -b.baseR * sy - 14, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function updateBalloons(dt) {
    for (let i = state.balloons.length - 1; i >= 0; i--) {
      const b = state.balloons[i];
      if (!b.alive) {
        state.balloons.splice(i, 1);
        continue;
      }

      b.bob += b.bobSpeed * dt;
      b.pulse += dt * 5;
      if (b.type === TYPES.RAINBOW) b.rainbowHue = (b.rainbowHue + dt * 90) % 360;

      // возврат squash
      b.squashX += (1 - b.squashX) * Math.min(1, dt * 6);
      b.squashY += (1 - b.squashY) * Math.min(1, dt * 6);

      if (b.hint > 0) {
        b.hint = Math.max(0, b.hint - dt * 0.35);
      }

      // движение
      b.x += b.vx * dt + Math.sin(b.bob) * 12 * dt;
      b.y += b.vy * dt;

      // лёгкое покачивание скорости
      b.vx += Math.sin(b.bob * 0.7) * 15 * dt;

      // границы
      const m = b.r * 0.6;
      if (b.x < m) {
        b.x = m;
        b.vx = Math.abs(b.vx) * 0.8;
      } else if (b.x > state.w - m) {
        b.x = state.w - m;
        b.vx = -Math.abs(b.vx) * 0.8;
      }

      // улетает вверх — переспавн снизу или удаление маленьких
      if (b.y < -b.r - 40) {
        if (b.type === TYPES.SMALL || b.fromSplit) {
          if (b.type === TYPES.SMALL) state.smallCount = Math.max(0, state.smallCount - 1);
          state.balloons.splice(i, 1);
        } else if (!state.running) {
          // в меню — мягкий цикл
          b.y = state.h + b.r + rand(20, 80);
          b.x = rand(b.r + 10, state.w - b.r - 10);
        } else {
          b.y = state.h + b.r + rand(20, 100);
          b.x = rand(b.r + 10, state.w - b.r - 10);
          b.vx = rand(-40, 40);
          b.vy = -rand(45, 95);
        }
        continue;
      }

      // улетел вниз (дождь / маленькие / меню) — убрать или перезапустить
      if (b.y > state.h + b.r + 80) {
        if (!state.running) {
          b.y = state.h + b.r + rand(20, 80);
          b.vy = -rand(20, 45);
          b.x = rand(b.r + 10, Math.max(b.r + 20, state.w - b.r - 10));
        } else if (b.vy > 0 || b.type === TYPES.SMALL || b.fromSplit) {
          if (b.type === TYPES.SMALL) state.smallCount = Math.max(0, state.smallCount - 1);
          state.balloons.splice(i, 1);
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // Попадания и эффекты
  // ─────────────────────────────────────────────
  function showPopText(x, y, text, color) {
    const el = document.createElement("div");
    el.className = "pop-text";
    el.textContent = text;
    el.style.left = `${(x / state.w) * 100}%`;
    el.style.top = `${(y / state.h) * 100}%`;
    if (color) el.style.color = color;
    popTextLayer.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 950);
  }

  function removeBalloon(b) {
    b.alive = false;
    if (b.type === TYPES.SMALL) {
      state.smallCount = Math.max(0, state.smallCount - 1);
    }
  }

  function registerHit() {
    state.score += 1;
    scoreValue.textContent = String(state.score);
    state.hitsSinceSurprise += 1;
    state.lastHitTime = performance.now();
    state.hintBalloonId = null;

    if (state.mode === "smart" && Math.random() < 0.35) {
      pickSmartTarget();
    }

    if (state.hitsSinceSurprise >= state.nextSurpriseAt) {
      state.hitsSinceSurprise = 0;
      state.nextSurpriseAt = randInt(SURPRISE_MIN, SURPRISE_MAX);
      triggerSurprise();
    }
  }

  function popBalloon(b, isCorrect = true) {
    const col = getBalloonColor(b);

    switch (b.type) {
      case TYPES.RED: {
        SFX.boom();
        burst(b.x, b.y, col.main, 18, 280);
        starBurst(b.x, b.y, 8);
        showPopText(b.x, b.y, "БАБАХ!", "#fff");
        removeBalloon(b);
        if (isCorrect) registerHit();
        break;
      }
      case TYPES.YELLOW: {
        SFX.split();
        burst(b.x, b.y, col.main, 12, 200);
        showPopText(b.x, b.y, "УРА!", col.main);
        spawnSmallFrom(b);
        removeBalloon(b);
        if (isCorrect) registerHit();
        break;
      }
      case TYPES.BLUE: {
        SFX.plop();
        burst(b.x, b.y, col.main, 10, 140);
        addJelly(b.x, b.y, col.main);
        showPopText(b.x, b.y, "ПЛЮХ!", col.light);
        removeBalloon(b);
        if (isCorrect) registerHit();
        break;
      }
      case TYPES.GREEN: {
        b.hits += 1;
        if (b.hits < b.maxHits) {
          SFX.bounce();
          b.vy = -rand(160, 240);
          b.vx += rand(-80, 80);
          b.squashX = 1.35;
          b.squashY = 0.7;
          showPopText(b.x, b.y, "ПРУНГ!", col.main);
        } else {
          SFX.pop();
          burst(b.x, b.y, col.main, 16, 240);
          starBurst(b.x, b.y, 6);
          showPopText(b.x, b.y, "БАБАХ!", "#fff");
          removeBalloon(b);
          if (isCorrect) registerHit();
        }
        break;
      }
      case TYPES.RAINBOW: {
        SFX.party();
        confettiBurst(b.x, b.y, 48);
        starBurst(b.x, b.y, 12);
        burst(b.x, b.y, col.main, 14, 260);
        showPopText(b.x, b.y, "САЛЮТ!", "#ffeaa7");
        removeBalloon(b);
        if (isCorrect) registerHit();
        break;
      }
      case TYPES.GIANT: {
        b.hits += 1;
        if (b.hits < b.maxHits) {
          SFX.squash();
          const deform = b.hits === 1 ? [1.4, 0.65] : [0.7, 1.35];
          b.squashX = deform[0];
          b.squashY = deform[1];
          b.r = b.baseR * (1 - b.hits * 0.06);
          burst(b.x, b.y, col.main, 8, 120);
          showPopText(b.x, b.y, b.hits === 1 ? "ХЕ-ХЕ!" : "ЕЩЁ!", col.light);
        } else {
          SFX.boom();
          confettiBurst(b.x, b.y, 30);
          burst(b.x, b.y, col.main, 24, 320);
          starBurst(b.x, b.y, 14);
          showPopText(b.x, b.y, "БАБАХ!!!", "#fff");
          removeBalloon(b);
          if (isCorrect) registerHit();
        }
        break;
      }
      case TYPES.SMALL:
      default: {
        SFX.bloop();
        burst(b.x, b.y, col.main, 10, 180);
        removeBalloon(b);
        if (isCorrect) registerHit();
        break;
      }
    }
  }

  function balloonMatchesSmart(b) {
    if (b.type === TYPES.SMALL) return true;
    if (b.type === TYPES.GIANT || b.type === TYPES.RAINBOW) return true;
    return b.colorKey === state.smartColor;
  }

  function findBalloonAt(x, y) {
    // сверху вниз по z (последние нарисованные — первые)
    for (let i = state.balloons.length - 1; i >= 0; i--) {
      const b = state.balloons[i];
      if (!b.alive) continue;
      const rx = b.r * b.squashX;
      const ry = b.r * b.squashY;
      const dx = (x - b.x) / rx;
      const dy = (y - b.y) / ry;
      if (dx * dx + dy * dy <= 1.05) return b;
    }
    return null;
  }

  function handlePointer(clientX, clientY) {
    if (!state.running || state.paused || state.mode === "menu") return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * state.w;
    const y = ((clientY - rect.top) / rect.height) * state.h;

    const b = findBalloonAt(x, y);
    if (!b) {
      // промах — без наказания, только обновляем таймер подсказки
      return;
    }

    if (state.mode === "smart" && !balloonMatchesSmart(b)) {
      // мягкая реакция — лёгкий отскок без лопания
      SFX.bounce();
      b.squashX = 1.2;
      b.squashY = 0.85;
      b.hint = 0;
      // подсветим правильные
      highlightSmartTargets();
      return;
    }

    popBalloon(b, true);
  }

  function highlightSmartTargets() {
    for (const b of state.balloons) {
      if (b.alive && balloonMatchesSmart(b)) {
        b.hint = 1;
      }
    }
  }

  // ─────────────────────────────────────────────
  // Подсказки и сюрпризы
  // ─────────────────────────────────────────────
  function updateHints() {
    if (!state.running || state.paused) return;
    const now = performance.now();
    if (now - state.lastHitTime < HINT_DELAY_MS) return;
    if (state.balloons.filter((b) => b.alive).length === 0) return;

    if (state.mode === "smart") {
      highlightSmartTargets();
      state.lastHitTime = now - HINT_DELAY_MS / 2;
      return;
    }

    // свободный режим — мягко подсветить один шарик
    let target = state.balloons.find((b) => b.id === state.hintBalloonId && b.alive);
    if (!target) {
      const alive = state.balloons.filter((b) => b.alive);
      target = pick(alive);
      state.hintBalloonId = target.id;
    }
    target.hint = 1;
  }

  function triggerSurprise() {
    const kind = randInt(0, 3);
    switch (kind) {
      case 0: {
        // гигантский шарик
        spawnBalloon(TYPES.GIANT);
        showPopText(state.w / 2, state.h * 0.3, "ОГО!", "#a55eea");
        SFX.party();
        break;
      }
      case 1: {
        // дождь шариков
        state.rainUntil = performance.now() + RAIN_DURATION_MS;
        state.rainSpawnTimer = 0;
        showPopText(state.w / 2, state.h * 0.3, "ДОЖДЬ!", "#70a1ff");
        SFX.bloop();
        break;
      }
      case 2: {
        // смешные рожицы
        state.faceModeUntil = performance.now() + FACE_SURPRISE_MS;
        for (const b of state.balloons) {
          if (b.alive) b.face = randInt(0, 4);
        }
        showPopText(state.w / 2, state.h * 0.3, "ХИ-ХИ!", "#ff6b81");
        SFX.split();
        break;
      }
      case 3:
      default: {
        // радужный с салютом
        const rb = createBalloon({
          type: TYPES.RAINBOW,
          x: state.w / 2,
          y: state.h + 80,
          vy: -120,
        });
        state.balloons.push(rb);
        confettiBurst(state.w / 2, state.h * 0.4, 24);
        showPopText(state.w / 2, state.h * 0.28, "РАДУГА!", "#ffeaa7");
        SFX.party();
        break;
      }
    }
  }

  function updateRain(dt) {
    if (performance.now() > state.rainUntil) return;
    state.rainSpawnTimer -= dt * 1000;
    if (state.rainSpawnTimer <= 0) {
      state.rainSpawnTimer = RAIN_SPAWN_MS;
      if (state.balloons.filter((b) => b.alive).length < MAX_BALLOONS + 3) {
        const types = [TYPES.RED, TYPES.YELLOW, TYPES.BLUE, TYPES.GREEN];
        const b = createBalloon({
          type: pick(types),
          x: rand(40, state.w - 40),
          y: -60,
          vy: rand(60, 120),
          vx: rand(-30, 30),
        });
        // падают сверху вниз — инвертируем типичный подъём
        state.balloons.push(b);
      }
    }
  }

  // ─────────────────────────────────────────────
  // Умный режим
  // ─────────────────────────────────────────────
  function pickSmartTarget() {
    state.smartColor = pick(SMART_COLORS);
    const map = {
      red: COLORS.red.main,
      yellow: COLORS.yellow.main,
      blue: COLORS.blue.main,
      green: COLORS.green.main,
    };
    targetBall.style.background = map[state.smartColor];
  }

  // ─────────────────────────────────────────────
  // Игровой цикл
  // ─────────────────────────────────────────────
  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = window.innerWidth;
    state.h = window.innerHeight;
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = state.w + "px";
    canvas.style.height = state.h + "px";
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (state.clouds.length === 0) initClouds();
  }

  function clearWorld() {
    state.balloons = [];
    state.particles = [];
    state.jellies = [];
    state.smallCount = 0;
    state.spawnTimer = 0;
    state.rainUntil = 0;
    state.faceModeUntil = 0;
    state.hintBalloonId = null;
    state.hitsSinceSurprise = 0;
    state.nextSurpriseAt = randInt(SURPRISE_MIN, SURPRISE_MAX);
    popTextLayer.innerHTML = "";
  }

  function startGame(mode) {
    resumeAudio();
    SFX.ui();
    state.mode = mode;
    state.running = true;
    state.paused = false;
    state.score = 0;
    scoreValue.textContent = "0";
    state.lastHitTime = performance.now();
    clearWorld();
    menuScreen.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    hud.classList.remove("hidden");

    if (mode === "smart") {
      pickSmartTarget();
      smartTarget.classList.remove("hidden");
    } else {
      smartTarget.classList.add("hidden");
    }

    // стартовые шарики
    for (let i = 0; i < 3; i++) {
      const b = createBalloon({
        y: state.h * rand(0.35, 0.75),
        vy: -rand(35, 70),
      });
      state.balloons.push(b);
    }

    if (!state.rafId) {
      state.lastTime = performance.now();
      state.rafId = requestAnimationFrame(loop);
    }
  }

  function spawnMenuBalloons() {
    for (let i = 0; i < 4; i++) {
      const b = createBalloon({
        type: pick([TYPES.RED, TYPES.YELLOW, TYPES.BLUE, TYPES.GREEN, TYPES.RAINBOW]),
        x: rand(60, Math.max(80, state.w - 60)),
        y: rand(state.h * 0.2, state.h * 0.85),
        vy: -rand(20, 45),
        vx: rand(-25, 25),
      });
      state.balloons.push(b);
    }
  }

  function stopGameToMenu() {
    SFX.ui();
    state.running = false;
    state.paused = false;
    state.mode = "menu";
    clearWorld();
    hud.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    smartTarget.classList.add("hidden");
    menuScreen.classList.remove("hidden");
    spawnMenuBalloons();
  }

  function setPaused(paused) {
    if (!state.running) return;
    state.paused = paused;
    if (paused) {
      pauseOverlay.classList.remove("hidden");
      SFX.ui();
    } else {
      pauseOverlay.classList.add("hidden");
      state.lastTime = performance.now();
      state.lastHitTime = performance.now();
      SFX.ui();
    }
  }

  function loop(now) {
    state.rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - state.lastTime) / 1000) || 0.016;
    state.lastTime = now;

    if (!state.running || state.paused) {
      // меню / пауза: небо и декоративные шарики живут
      updateClouds(dt * 0.7);
      if (!state.paused) {
        updateBalloons(dt * 0.7);
        updateParticles(dt);
        updateJellies(dt);
      }
      drawFrame();
      return;
    }

    // спавн
    state.spawnTimer -= dt * 1000;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = rand(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX);
      spawnBalloon();
    }

    updateClouds(dt);
    updateBalloons(dt);
    updateParticles(dt);
    updateJellies(dt);
    updateRain(dt);
    updateHints();

    drawFrame();
  }

  function drawFrame() {
    drawSky();
    for (const c of state.clouds) drawCloud(c);
    drawJellies();
    for (const b of state.balloons) drawBalloon(b);
    drawParticles();
  }

  // ─────────────────────────────────────────────
  // События
  // ─────────────────────────────────────────────
  function onFirstInteract() {
    resumeAudio();
  }

  function bindUI() {
    btnPlay.addEventListener("click", (e) => {
      e.stopPropagation();
      onFirstInteract();
      startGame("free");
    });

    btnSmart.addEventListener("click", (e) => {
      e.stopPropagation();
      onFirstInteract();
      startGame("smart");
    });

    const toggleMute = (e) => {
      e.stopPropagation();
      onFirstInteract();
      state.muted = !state.muted;
      updateMuteIcons();
      if (!state.muted) SFX.ui();
    };
    btnMuteMenu.addEventListener("click", toggleMute);
    btnMuteGame.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMute(e);
    });

    btnHome.addEventListener("click", (e) => {
      e.stopPropagation();
      stopGameToMenu();
    });

    btnPause.addEventListener("click", (e) => {
      e.stopPropagation();
      setPaused(true);
    });

    btnResume.addEventListener("click", (e) => {
      e.stopPropagation();
      setPaused(false);
    });

    btnPauseHome.addEventListener("click", (e) => {
      e.stopPropagation();
      stopGameToMenu();
    });

    // Pointer Events на canvas
    canvas.addEventListener("pointerdown", (e) => {
      onFirstInteract();
      if (e.button != null && e.button !== 0) return;
      handlePointer(e.clientX, e.clientY);
    });

    // не даём жестам прокрутки мешать
    canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

    window.addEventListener("resize", () => {
      resize();
    });

    window.addEventListener("visibilitychange", () => {
      if (document.hidden && state.running && !state.paused) {
        setPaused(true);
      }
    });

    // клавиша Escape — пауза
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.running) {
        setPaused(!state.paused);
      }
      if ((e.key === " " || e.key === "p" || e.key === "P") && state.running) {
        e.preventDefault();
        setPaused(!state.paused);
      }
    });
  }

  // ─────────────────────────────────────────────
  // Старт
  // ─────────────────────────────────────────────
  function init() {
    resize();
    initClouds();
    updateMuteIcons();
    bindUI();
    spawnMenuBalloons();
    state.lastTime = performance.now();
    state.rafId = requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
