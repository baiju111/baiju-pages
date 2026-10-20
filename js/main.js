(function () {
  "use strict";

  const DATA = window.PIXEL_LOGO_DATA;
  const stage = document.getElementById("art-stage");
  const canvas = document.getElementById("logo-canvas");
  const image = document.getElementById("final-image");
  const phaseLabel = document.getElementById("phase-label");
  const microGrid = document.getElementById("micro-grid");
  const methodReplay = document.getElementById("method-replay");
  const contactReplay = document.getElementById("contact-replay");

  if (!stage || !canvas || !image) {
    return;
  }

  const ctx = canvas.getContext("2d", { alpha: true });
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const PHASES = [
    { key: "awakening", label: "AWAKENING / 方块苏醒", duration: 1.05 },
    { key: "converging", label: "CONVERGING / 能量汇聚", duration: 1.65 },
    { key: "outlining", label: "OUTLINING / 轮廓显现", duration: 1.35 },
    { key: "rearranging", label: "REARRANGING / 局部重组", duration: 0.85 },
    { key: "settling", label: "SETTLING / 精准归位", duration: 0.7 }
  ];
  const phaseBounds = [];
  let running = 0;
  for (const phase of PHASES) {
    phaseBounds.push({ ...phase, start: running, end: running + phase.duration });
    running += phase.duration;
  }
  const TOTAL = running;

  const STRENGTH = {
    low: { scatter: 0.68, stage: 0.7, radius: 82, push: 0.62, pulse: 0.65 },
    medium: { scatter: 1, stage: 1, radius: 112, push: 1, pulse: 1 },
    high: { scatter: 1.3, stage: 1.28, radius: 148, push: 1.38, pulse: 1.45 }
  };

  const app = {
    state: "loading",
    running: false,
    paused: false,
    autoPaused: false,
    startedAt: 0,
    pauseStarted: 0,
    pauseOffset: 0,
    raf: 0,
    runId: 0,
    strength: "medium",
    reduced: reducedQuery.matches,
    currentTime: 0,
    lastPhaseIndex: -1,
    finalised: false,
    finalTimer: 0,
    replayTimer: 0
  };

  let cells = [];
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  const interaction = {
    active: false,
    pointer: null,
    targets: new Float32Array(0),
    current: new Float32Array(0),
    raf: 0,
    last: 0,
    pulse: null,
    settleTimer: 0,
    touchHeld: false
  };

  const A = phaseBounds[0];
  const B = phaseBounds[1];
  const C = phaseBounds[2];
  const D = phaseBounds[3];
  const E = phaseBounds[4];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    t = clamp(t, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutCubic(t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function hash01(index, seed) {
    const value = Math.sin((index + 1) * 127.1 + seed * 311.7) * 43758.5453123;
    return value - Math.floor(value);
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function setState(next) {
    if (app.state === next) return;
    app.state = next;
    stage.dataset.state = next;
    document.body.dataset.pageState = next;
  }

  function setReplayEnabled(enabled) {
    if (methodReplay) methodReplay.disabled = !enabled;
    if (contactReplay) contactReplay.disabled = !enabled;
  }

  function getPhaseIndex(time) {
    for (let index = phaseBounds.length - 1; index >= 0; index -= 1) {
      if (time >= phaseBounds[index].start) return index;
    }
    return 0;
  }

  function setPhaseLabel(text) {
    if (phaseLabel && phaseLabel.textContent !== text) phaseLabel.textContent = text;
  }

  function setStageLabel(text) {
    if (stage) stage.setAttribute("aria-label", text);
  }

  function buildModel() {
    const width = DATA.render.width;
    const height = DATA.render.height;
    const targetSize = DATA.grid.targetSize;
    const count = DATA.cells.length;
    interaction.targets = new Float32Array(count * 2);
    interaction.current = new Float32Array(count * 2);

    cells = DATA.cells.map((cell, index) => ({
      id: index,
      cx: cell.cx,
      cy: cell.cy,
      size: targetSize,
      color: cell.color,
      outline: Boolean(cell.outline),
      fill: `rgb(${cell.color[0]}, ${cell.color[1]}, ${cell.color[2]})`,
      row: cell.row,
      col: cell.col,
      // Motion-only values; targets are never written after this point.
      sx: cell.cx,
      sy: cell.cy,
      stageX: cell.cx,
      stageY: cell.cy,
      c1x: cell.cx,
      c1y: cell.cy,
      c2x: cell.cx,
      c2y: cell.cy,
      stageAngle: 0,
      stageRadius: 0,
      jumpAngle: 0,
      awakeDelay: 0,
      convergeDelay: 0,
      convergeDuration: 1.15,
      settleDelay: 0,
      rearrange: false,
      rearrangeAngle: 0,
      rearrangeDistance: 0,
      ox: 0,
      oy: 0
    }));

    return { width, height, count };
  }

  function initialiseGeometry(seed) {
    const rand = mulberry32(seed);
    const width = DATA.render.width;
    const height = DATA.render.height;
    const config = STRENGTH[app.strength];
    const centerX = width / 2;
    const centerY = height * 0.52;

    for (const cell of cells) {
      const angle = rand() * Math.PI * 2;
      const spread = 0.26 + rand() * 0.3;
      const radiusX = width * spread * config.scatter;
      const radiusY = height * spread * config.scatter;
      const cloudX = centerX + Math.cos(angle) * radiusX;
      const cloudY = centerY + Math.sin(angle) * radiusY;
      const mix = 0.28 + rand() * 0.6;
      let sx = lerp(cell.cx, cloudX, mix);
      let sy = lerp(cell.cy, cloudY, mix);
      sx = clamp(sx, cell.size / 2 + 10, width - cell.size / 2 - 10);
      sy = clamp(sy, cell.size / 2 + 10, height - cell.size / 2 - 10);
      cell.sx = sx;
      cell.sy = sy;

      cell.stageAngle = angle;
      cell.stageRadius = (cell.outline ? 16 : 28) + rand() * (cell.outline ? 34 : 78);
      cell.stageRadius *= config.stage;
      cell.stageX = clamp(
        cell.cx + Math.cos(angle) * cell.stageRadius,
        cell.size / 2 + 2,
        width - cell.size / 2 - 2
      );
      cell.stageY = clamp(
        cell.cy + Math.sin(angle) * cell.stageRadius,
        cell.size / 2 + 2,
        height - cell.size / 2 - 2
      );

      const dx = cell.stageX - cell.sx;
      const dy = cell.stageY - cell.sy;
      const length = Math.max(1, Math.hypot(dx, dy));
      const curve = (rand() < 0.5 ? -1 : 1) * length * (0.08 + rand() * 0.16);
      cell.c1x = (cell.sx + cell.stageX) / 2 + (-dy / length) * curve;
      cell.c1y = (cell.sy + cell.stageY) / 2 + (dx / length) * curve;

      const dx2 = cell.cx - cell.stageX;
      const dy2 = cell.cy - cell.stageY;
      const length2 = Math.max(1, Math.hypot(dx2, dy2));
      const curve2 = (rand() < 0.5 ? -1 : 1) * length2 * 0.06;
      cell.c2x = (cell.stageX + cell.cx) / 2 + (-dy2 / length2) * curve2;
      cell.c2y = (cell.stageY + cell.cy) / 2 + (dx2 / length2) * curve2;

      cell.jumpAngle = rand() * Math.PI * 2;
      cell.awakeDelay = hash01(cell.id, seed + 1) * 0.38;
      cell.convergeDelay = hash01(cell.id, seed + 2) * 0.3;
      cell.convergeDuration = 0.92 + hash01(cell.id, seed + 3) * 0.28;
      cell.settleDelay = hash01(cell.id, seed + 4) * 0.14;
      cell.rearrange = !cell.outline && hash01(cell.id, seed + 5) > 0.73;
      cell.rearrangeAngle = rand() * Math.PI * 2;
      cell.rearrangeDistance = cell.size * (0.4 + rand() * 0.45);
      cell.ox = 0;
      cell.oy = 0;
    }

    for (let index = 0; index < interaction.targets.length; index += 1) {
      interaction.targets[index] = 0;
      interaction.current[index] = 0;
    }
  }

  function setStaticGeometry() {
    for (const cell of cells) {
      cell.sx = cell.cx;
      cell.sy = cell.cy;
      cell.stageX = cell.cx;
      cell.stageY = cell.cy;
    }
  }

  function bezier(x0, y0, x1, y1, x2, y2, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * x0 + 2 * mt * t * x1 + t * t * x2,
      y: mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
    };
  }

  function getPose(cell, time) {
    let x = cell.cx;
    let y = cell.cy;
    let alpha = 1;

    if (time <= 0) {
      return {
        x: cell.sx + Math.sin(cell.id) * 1.5,
        y: cell.sy + Math.cos(cell.id) * 1.5,
        alpha: 0
      };
    }

    if (time < A.end) {
      const local = time - A.start;
      const reveal = clamp((local - cell.awakeDelay) / 0.42, 0, 1);
      alpha = easeOutCubic(reveal);
      const drift = 2.2 * easeOutCubic(reveal);
      x = cell.sx + Math.sin(local * 2.1 + cell.id * 0.37) * drift;
      y = cell.sy + Math.cos(local * 1.75 + cell.id * 0.21) * drift;
      return { x, y, alpha };
    }

    if (time < B.end) {
      const local = time - B.start;
      const progress = clamp((local - cell.convergeDelay) / cell.convergeDuration, 0, 1);
      const eased = easeInOutCubic(progress);
      const point = bezier(
        cell.sx, cell.sy,
        cell.c1x, cell.c1y,
        cell.stageX, cell.stageY,
        eased
      );
      const drift = (1 - eased) * 1.2;
      x = point.x + Math.sin(local * 2 + cell.id) * drift;
      y = point.y + Math.cos(local * 1.8 + cell.id) * drift;
      return { x, y, alpha: 1 };
    }

    if (time < C.end) {
      const local = time - C.start;
      const delay = cell.outline ? 0 : 0.23 + hash01(cell.id, app.runId + 9) * 0.3;
      const duration = cell.outline ? 0.52 : 0.66;
      const progress = clamp((local - delay) / duration, 0, 1);
      const eased = easeInOutCubic(progress);
      const point = bezier(
        cell.stageX, cell.stageY,
        cell.c2x, cell.c2y,
        cell.cx, cell.cy,
        eased
      );
      return { x: point.x, y: point.y, alpha: 1 };
    }

    if (time < D.end) {
      const local = time - D.start;
      const progress = clamp(local / D.duration, 0, 1);
      if (cell.rearrange) {
        const wave = Math.sin(progress * Math.PI);
        x = cell.cx + Math.cos(cell.rearrangeAngle) * cell.rearrangeDistance * wave;
        y = cell.cy + Math.sin(cell.rearrangeAngle) * cell.rearrangeDistance * wave;
      }
      return { x, y, alpha: 1 };
    }

    return { x: cell.cx, y: cell.cy, alpha: 1 };
  }

  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    scale = Math.min(canvas.width / DATA.render.width, canvas.height / DATA.render.height);
    offsetX = (canvas.width - DATA.render.width * scale) / 2;
    offsetY = (canvas.height - DATA.render.height * scale) / 2;
  }

  function drawCells(time) {
    if (!ctx) return;
    resizeCanvas();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    ctx.imageSmoothingEnabled = false;

    for (const cell of cells) {
      const pose = getPose(cell, time);
      if (pose.alpha <= 0.002) continue;
      ctx.globalAlpha = pose.alpha;
      ctx.fillStyle = cell.fill;
      const size = cell.size;
      ctx.fillRect(
        pose.x + cell.ox - size / 2,
        pose.y + cell.oy - size / 2,
        size,
        size
      );
    }
    ctx.globalAlpha = 1;
  }

  function drawStaticTargets() {
    drawCells(TOTAL);
  }

  function updateReadout(time, force) {
    if (app.paused) return;
    const phaseIndex = Math.min(getPhaseIndex(time), phaseBounds.length - 1);
    const phase = phaseBounds[phaseIndex];
    if (force || phaseIndex !== app.lastPhaseIndex) {
      app.lastPhaseIndex = phaseIndex;
      setState(phase.key);
      setPhaseLabel(phase.label);
    }
  }

  function finishAnimation() {
    if (app.finalised) return;
    app.finalised = true;
    app.running = false;
    app.paused = false;
    app.currentTime = TOTAL;
    cancelAnimationFrame(app.raf);
    app.raf = 0;
    drawCells(TOTAL);
    stage.classList.add("is-complete", "is-ready");
    stage.classList.remove("is-live");
    setState("complete");
    setPhaseLabel("COMPLETE / 已归位");
    setStageLabel("像素画已完成：点击或按 Enter 重播");
    app.lastPhaseIndex = phaseBounds.length - 1;
    window.__PIXEL_READY__ = true;
  }

  function tick(now) {
    app.raf = 0;
    if (!app.running || app.paused) return;
    const elapsed = (now - app.startedAt - app.pauseOffset) / 1000;
    app.currentTime = clamp(elapsed, 0, TOTAL);
    if (elapsed >= TOTAL) {
      finishAnimation();
      return;
    }
    drawCells(app.currentTime);
    updateReadout(app.currentTime, false);
    app.raf = requestAnimationFrame(tick);
  }

  function startLoop() {
    cancelAnimationFrame(app.raf);
    app.raf = requestAnimationFrame(tick);
  }

  function startFull() {
    if (!DATA || !DATA.cells || !DATA.cells.length || !ctx) {
      fallback("missing-data");
      return;
    }
    app.runId += 1;
    const seed = (0x9e3779b9 ^ (app.runId * 0x45d9f3b)) >>> 0;
    clearTimeout(app.finalTimer);
    clearTimeout(app.replayTimer);
    clearTimeout(interaction.settleTimer);
    interaction.settleTimer = 0;
    cancelAnimationFrame(interaction.raf);
    interaction.raf = 0;
    interaction.pointer = null;
    interaction.pulse = null;
    interaction.active = false;
    interaction.current.fill(0);
    interaction.targets.fill(0);

    app.finalised = false;
    app.paused = false;
    app.autoPaused = false;
    app.running = true;
    app.pauseOffset = 0;
    app.startedAt = performance.now() + 90;
    app.currentTime = 0;
    app.lastPhaseIndex = -1;
    image.style.opacity = "";
    image.style.transition = "";

    initialiseGeometry(seed);
    setState("idle");
    stage.classList.remove("is-complete", "is-static", "is-live");
    stage.classList.add("is-ready", "is-live");
    setReplayEnabled(true);
    setPhaseLabel("AWAKENING / 方块苏醒");
    setStageLabel("像素画动画：点击或按 Enter 重播，按空格暂停或继续");
    drawCells(0);
    window.__PIXEL_READY__ = true;
    app.raf = requestAnimationFrame((now) => {
      app.raf = 0;
      app.startedAt = Math.max(app.startedAt, now + 70);
      startLoop();
    });
  }

  function pauseAnimation(auto) {
    if (!app.running || app.paused) return;
    app.paused = true;
    app.autoPaused = Boolean(auto);
    app.pauseStarted = performance.now();
    cancelAnimationFrame(app.raf);
    app.raf = 0;
    setState("paused");
    setPhaseLabel(auto ? "PAUSED / 页面不可见" : "PAUSED / 当前帧冻结");
    setStageLabel("像素画已暂停：按空格继续");
  }

  function resumeAnimation() {
    if (!app.running || !app.paused) return;
    const now = performance.now();
    app.pauseOffset += now - app.pauseStarted;
    app.paused = false;
    app.autoPaused = false;
    setPhaseLabel("RESUMING / 继续");
    setStageLabel("像素画动画：点击或按 Enter 重播，按空格暂停或继续");
    app.lastPhaseIndex = -1;
    startLoop();
  }

  function showStatic(reason) {
    app.running = false;
    app.paused = false;
    app.finalised = true;
    cancelAnimationFrame(app.raf);
    app.raf = 0;
    cancelAnimationFrame(interaction.raf);
    interaction.raf = 0;
    clearTimeout(interaction.settleTimer);
    stage.classList.remove("is-live", "is-complete");
    stage.classList.add("is-static", "is-ready");
    setState("reduced-motion");
    app.currentTime = TOTAL;
    setPhaseLabel(reason === "fallback" ? "FALLBACK / 静态像素画" : "REDUCED MOTION / 静态优先");
    setStageLabel("静态像素画：点击重播低动态版本");
    image.style.opacity = "";
    image.style.transition = "";
    setReplayEnabled(true);
    window.__PIXEL_READY__ = true;
  }

  function fallback(reason) {
    app.running = false;
    app.finalised = true;
    cancelAnimationFrame(app.raf);
    app.raf = 0;
    cancelAnimationFrame(interaction.raf);
    interaction.raf = 0;
    stage.classList.remove("is-live");
    stage.classList.add("is-complete", "is-ready");
    setState("fallback");
    setPhaseLabel("FALLBACK / 静态像素画");
    setStageLabel("静态像素画");
    setReplayEnabled(false);
    image.style.opacity = "";
    image.style.transition = "";
    if (reason !== "image-error") stage.classList.add("is-static");
    window.__PIXEL_READY__ = true;
  }

  function replayReduced() {
    if (!image.naturalWidth) {
      fallback("image-error");
      return;
    }
    image.style.transition = "none";
    image.style.opacity = "0";
    requestAnimationFrame(() => {
      image.style.transition = "opacity 900ms ease";
      image.style.opacity = "1";
    });
    setPhaseLabel("REDUCED MOTION / 低动态");
    setTimeout(() => {
      image.style.transition = "";
      image.style.opacity = "";
      setPhaseLabel("REDUCED MOTION / 静态优先");
    }, 1050);
  }

  function replay() {
    if (app.reduced) {
      replayReduced();
      return;
    }
    startFull();
  }

  function scrollToHeroAndReplay() {
    clearTimeout(app.replayTimer);
    const reduce = reducedQuery.matches;
    document.getElementById("top").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    app.replayTimer = setTimeout(() => {
      replay();
    }, reduce ? 40 : 360);
  }

  function setStrength(next) {
    if (!STRENGTH[next] || app.strength === next) return;
    app.strength = next;
    if (interaction.pointer) {
      updatePointerTargets();
      scheduleInteraction();
    }
  }

  function pointerInArt(event) {
    if (!app.finalised || !cells.length || app.state === "reduced-motion" || app.state === "fallback") return;
    if (event.pointerType === "touch" && event.type !== "pointerdown" && !interaction.touchHeld) return;
    if (event.type === "pointerdown") {
      interaction.touchHeld = event.pointerType === "touch";
    }
    enterCanvasMode();
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const localX = ((event.clientX - rect.left) / rect.width) * DATA.render.width;
    const localY = ((event.clientY - rect.top) / rect.height) * DATA.render.height;
    interaction.pointer = { x: localX, y: localY };
    updatePointerTargets();
    scheduleInteraction();
  }

  function updatePointerTargets() {
    const config = STRENGTH[app.strength];
    const radius = config.radius;
    const push = config.push;
    if (!interaction.targets.length) return;
    interaction.targets.fill(0);
    if (!interaction.pointer) return;
    const pointer = interaction.pointer;
    for (const cell of cells) {
      const dx = cell.cx - pointer.x;
      const dy = cell.cy - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= radius) continue;
      const force = Math.pow(1 - distance / radius, 1.55);
      const angle = distance < 0.1 ? cell.id * 0.71 : Math.atan2(dy, dx);
      const amount = cell.size * push * force;
      interaction.targets[cell.id * 2] = Math.cos(angle) * amount;
      interaction.targets[cell.id * 2 + 1] = Math.sin(angle) * amount;
    }
  }

  function pulseOffset(cell, now) {
    if (!interaction.pulse) return { x: 0, y: 0 };
    const config = STRENGTH[app.strength];
    const pulse = interaction.pulse;
    const progress = (now - pulse.start) / pulse.duration;
    if (progress >= 1) {
      interaction.pulse = null;
      return { x: 0, y: 0 };
    }
    const dx = cell.cx - pulse.x;
    const dy = cell.cy - pulse.y;
    const distance = Math.hypot(dx, dy);
    const radius = 180 * config.pulse;
    if (distance > radius) return { x: 0, y: 0 };
    const envelope = 1 - progress;
    const wave = Math.sin((distance / 54) * Math.PI * 2 - progress * Math.PI * 3.2);
    const amount = cell.size * 0.7 * config.pulse * envelope * wave * (1 - distance / radius);
    const angle = distance < 0.1 ? cell.id : Math.atan2(dy, dx);
    return { x: Math.cos(angle) * amount, y: Math.sin(angle) * amount };
  }

  function enterCanvasMode() {
    if (app.state === "reduced-motion" || stage.classList.contains("is-error")) return;
    clearTimeout(interaction.settleTimer);
    interaction.settleTimer = 0;
    stage.classList.remove("is-complete", "is-static");
    stage.classList.add("is-live");
    if (app.finalised) {
      app.currentTime = TOTAL;
      drawStaticTargets();
      setState("interactive");
      setPhaseLabel("INTERACTIVE / 局部扰动");
    }
  }

  function scheduleInteraction() {
    if (interaction.raf) return;
    interaction.active = true;
    interaction.last = performance.now();
    interaction.raf = requestAnimationFrame(stepInteraction);
  }

  function stepInteraction(now) {
    interaction.raf = 0;
    if (document.hidden) {
      interaction.active = false;
      return;
    }
    const dt = clamp((now - interaction.last) / 1000, 0.001, 0.05);
    interaction.last = now;
    const damping = 1 - Math.exp(-dt * 16);
    let moving = false;
    let touching = false;

    for (const cell of cells) {
      let tx = interaction.targets[cell.id * 2];
      let ty = interaction.targets[cell.id * 2 + 1];
      const pulse = pulseOffset(cell, now);
      tx += pulse.x;
      ty += pulse.y;
      if (tx !== 0 || ty !== 0) touching = true;
      const index = cell.id * 2;
      const dx = tx - interaction.current[index];
      const dy = ty - interaction.current[index + 1];
      if (Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02) moving = true;
      interaction.current[index] += dx * damping;
      interaction.current[index + 1] += dy * damping;
      cell.ox = interaction.current[index];
      cell.oy = interaction.current[index + 1];
    }

    drawStaticTargets();

    const activePointer = Boolean(interaction.pointer);
    const activePulse = Boolean(interaction.pulse);
    if (moving || activePointer || activePulse || touching) {
      interaction.raf = requestAnimationFrame(stepInteraction);
    } else {
      interaction.current.fill(0);
      for (const cell of cells) {
        cell.ox = 0;
        cell.oy = 0;
      }
      drawStaticTargets();
      interaction.active = false;
      interaction.settleTimer = window.setTimeout(() => {
        if (interaction.pointer || interaction.pulse) return;
        stage.classList.add("is-complete");
        stage.classList.remove("is-live");
        setState("complete");
        setPhaseLabel("COMPLETE / 已归位");
      }, 220);
    }
  }

  function endPointer(event) {
    if (!event || event.type === "pointerleave" || event.type === "pointerup" || event.type === "pointercancel") {
      interaction.pointer = null;
    }
    if (event && event.pointerType === "touch") {
      interaction.touchHeld = false;
    }
    if (!interaction.pointer) {
      interaction.targets.fill(0);
      scheduleInteraction();
    }
  }

  function triggerDeconstruct() {
    if (!app.finalised || !cells.length || app.state === "reduced-motion" || app.state === "fallback") return;
    enterCanvasMode();
    interaction.pulse = {
      start: performance.now(),
      duration: 1200,
      x: DATA.render.width * 0.5,
      y: DATA.render.height * 0.52
    };
    scheduleInteraction();
  }

  function handlePause() {
    if (!app.running) return;
    if (app.paused) {
      resumeAnimation();
    } else {
      pauseAnimation(false);
    }
  }

  function setupMicroGrid() {
    if (!microGrid) return;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 64; index += 1) {
      const cell = document.createElement("span");
      cell.className = "micro-cell";
      if ([27, 28, 35, 36].includes(index)) cell.classList.add("is-orange");
      if ((index * 5 + 3) % 17 === 0) cell.classList.add("is-dim");
      fragment.appendChild(cell);
    }
    microGrid.appendChild(fragment);

    const microCells = Array.from(microGrid.children);
    let centers = [];
    const measure = () => {
      const gridRect = microGrid.getBoundingClientRect();
      centers = microCells.map((cell) => {
        const rect = cell.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - gridRect.left,
          y: rect.top + rect.height / 2 - gridRect.top
        };
      });
    };

    const apply = (clientX, clientY) => {
      if (!centers.length) measure();
      const gridRect = microGrid.getBoundingClientRect();
      const x = clientX - gridRect.left;
      const y = clientY - gridRect.top;
      for (let index = 0; index < microCells.length; index += 1) {
        const cell = microCells[index];
        const center = centers[index];
        const dx = center.x - x;
        const dy = center.y - y;
        const distance = Math.hypot(dx, dy);
        const reach = Math.min(100, gridRect.width * 0.3);
        if (distance < reach) {
          const force = Math.pow(1 - distance / reach, 1.4);
          const angle = distance < 1 ? index : Math.atan2(dy, dx);
          const magnitude = 10 * force;
          cell.style.setProperty("--dx", Math.cos(angle) * magnitude + "px");
          cell.style.setProperty("--dy", Math.sin(angle) * magnitude + "px");
        } else {
          cell.style.removeProperty("--dx");
          cell.style.removeProperty("--dy");
        }
      }
    };

    const reset = () => {
      for (const cell of microCells) {
        cell.style.removeProperty("--dx");
        cell.style.removeProperty("--dy");
      }
    };

    microGrid.addEventListener("pointerenter", measure);
    microGrid.addEventListener("pointermove", (event) => {
      apply(event.clientX, event.clientY);
    });
    microGrid.addEventListener("pointerdown", (event) => {
      measure();
      apply(event.clientX, event.clientY);
    });
    microGrid.addEventListener("pointerleave", reset);
    microGrid.addEventListener("pointercancel", reset);
    microGrid.addEventListener("pointerup", (event) => {
      if (event.pointerType === "touch") {
        setTimeout(reset, 320);
      }
    });
    window.addEventListener("resize", () => {
      centers = [];
    }, { passive: true });
  }

  function setupDweller() {
    const trigger = document.getElementById("gap-trigger");
    const dweller = document.getElementById("gap-dweller");
    const close = document.getElementById("dweller-close");
    if (!trigger || !dweller || !close) return;
    const label = trigger.querySelector(".gap-trigger-label");
    let clicks = 0;
    let timer = 0;
    let isOpen = false;

    const reset = () => {
      clicks = 0;
      trigger.classList.remove("is-hot");
      if (label) label.innerHTML = "SECRET<br>0 / 3";
    };

    const open = () => {
      isOpen = true;
      dweller.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      trigger.classList.remove("is-hot");
      close.focus({ preventScroll: true });
    };

    const closeDweller = () => {
      if (!isOpen) return;
      isOpen = false;
      dweller.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      reset();
      trigger.focus({ preventScroll: true });
    };

    trigger.addEventListener("click", () => {
      clicks += 1;
      trigger.classList.add("is-hot");
      if (label) label.innerHTML = "SECRET<br>" + Math.min(clicks, 3) + " / 3";
      clearTimeout(timer);
      timer = setTimeout(reset, 1600);
      if (clicks >= 3) {
        clearTimeout(timer);
        open();
      }
    });

    close.addEventListener("click", closeDweller);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen) closeDweller();
    });
  }

  function setupControls() {
    if (methodReplay) methodReplay.addEventListener("click", scrollToHeroAndReplay);
    if (contactReplay) contactReplay.addEventListener("click", scrollToHeroAndReplay);

    stage.addEventListener("click", () => {
      if (stage.classList.contains("is-error")) return;
      stage.focus({ preventScroll: true });
      replay();
    });

    stage.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        handlePause();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (stage.classList.contains("is-error")) return;
        replay();
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        replay();
      }
    });

    stage.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") pointerInArt(event);
    });
    stage.addEventListener("pointermove", (event) => {
      pointerInArt(event);
    });
    stage.addEventListener("pointerdown", (event) => {
      pointerInArt(event);
    });
    stage.addEventListener("pointerleave", endPointer);
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);
    window.addEventListener("pointerup", endPointer, { passive: true });
    window.addEventListener("pointercancel", endPointer, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (app.running && !app.paused) pauseAnimation(true);
        cancelAnimationFrame(interaction.raf);
        interaction.raf = 0;
        interaction.active = false;
      } else {
        if (app.autoPaused) resumeAnimation();
        if (interaction.pointer || stage.classList.contains("is-live")) scheduleInteraction();
      }
    });

    if (typeof reducedQuery.addEventListener === "function") {
      reducedQuery.addEventListener("change", (event) => {
        app.reduced = event.matches;
        if (event.matches) {
          showStatic();
        } else if (app.state === "reduced-motion") {
          setPhaseLabel("REDUCED MOTION / 静态优先");
        }
      });
    }

    window.addEventListener("resize", () => {
      cancelAnimationFrame(interaction.raf);
      interaction.raf = 0;
      if (app.finalised && !stage.classList.contains("is-static")) {
        drawStaticTargets();
      } else if (app.running) {
        drawCells(app.currentTime);
      }
      if (interaction.pointer) scheduleInteraction();
    }, { passive: true });

    if ("ResizeObserver" in window) {
      new ResizeObserver(() => {
        if (app.finalised && !stage.classList.contains("is-static")) {
          drawStaticTargets();
        } else if (app.running) {
          drawCells(app.currentTime);
        }
      }).observe(stage);
    }
  }

  function setup() {
    if (!DATA || !Array.isArray(DATA.cells) || DATA.cells.length === 0) {
      fallback("missing-data");
      return;
    }
    if (!ctx) {
      fallback("no-canvas");
      return;
    }
    buildModel();
    setStaticGeometry();
    resizeCanvas();
    setupControls();
    setupMicroGrid();
    setupDweller();
    app.reduced = reducedQuery.matches;

    if (app.reduced) {
      showStatic();
      setPhaseLabel("REDUCED MOTION / 静态优先");
    } else {
      setState("loading");
      setPhaseLabel("LOADING / 读取网格");
    }

    const begin = () => {
      stage.classList.add("is-ready");
      if (app.reduced) {
        showStatic();
      } else {
        startFull();
      }
    };

    if (image.complete && image.naturalWidth) {
      requestAnimationFrame(begin);
    } else if (image.complete && !image.naturalWidth) {
      fallback("image-error");
    } else {
      image.addEventListener("load", () => requestAnimationFrame(begin), { once: true });
      image.addEventListener("error", () => fallback("image-error"), { once: true });
    }

    window.__PIXEL_APP__ = {
      getState: () => ({
        state: app.state,
        running: app.running,
        paused: app.paused,
        strength: app.strength,
        phase: Math.min(getPhaseIndex(app.currentTime), phaseBounds.length - 1),
        percent: Math.round((app.currentTime / TOTAL) * 100),
        currentTime: Number(app.currentTime.toFixed(3)),
        cells: cells.length,
        targetChecksum: cells.reduce((sum, cell) => sum + cell.cx * 1000 + cell.cy * 7 + cell.size, 0).toFixed(3),
        maxOffset: Number(Math.max(0, ...cells.map((cell) => Math.hypot(cell.ox, cell.oy))).toFixed(2)),
        runId: app.runId,
        rafActive: app.raf !== 0 || interaction.raf !== 0,
        imageVisible: getComputedStyle(image).opacity !== "0",
        canvasVisible: getComputedStyle(canvas).opacity !== "0",
        finalised: app.finalised
      }),
      replay,
      pause: () => pauseAnimation(false),
      resume: resumeAnimation,
      setStrength,
      pulse: triggerDeconstruct,
      total: TOTAL
    };
  }

  try {
    setup();
  } catch (error) {
    fallback("init-error");
    window.__PIXEL_READY__ = true;
    if (window.console && console.warn) console.warn("Pixel animation fallback:", error);
  }
})();
