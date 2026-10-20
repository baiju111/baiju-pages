import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = "D:\\codex项目\\网站模板测试\\2";
const OUT = path.join(ROOT, ".impeccable", "review");
const PORT = 9334;
const PROFILE = path.join(ROOT, "tests", ".chrome-profile");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--hide-scrollbars",
  "--disable-background-networking",
  "--disable-sync",
  "--window-size=1440,900",
  "about:blank"
], { detached: true, stdio: "ignore" });
chrome.unref();

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    }).on("error", reject);
  });
}

async function waitForEndpoint() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find((item) => item.type === "page");
      if (page) return page;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Chrome did not start");
}

class CDP {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      } else if (message.method) {
        const listeners = this.listeners.get(message.method) || [];
        for (const listener of listeners) listener(message.params);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }
  close() { this.ws.close(); }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(cdp, expression, awaitPromise = true) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Evaluation failed");
  }
  return result.result.value;
}

async function waitReady(cdp) {
  for (let i = 0; i < 120; i += 1) {
    const ready = await evaluate(cdp, "document.readyState === 'complete' && Boolean(window.__PIXEL_APP__) && Boolean(window.__WORKS_CAROUSEL__) && document.fonts.status === 'loaded'");
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Page did not become ready");
}

async function screenshot(cdp, file, fullPage = false) {
  let params = { format: "png", fromSurface: true, captureBeyondViewport: false };
  if (fullPage) {
    const metrics = await cdp.send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize || metrics.contentSize;
    params = {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 }
    };
  }
  const result = await cdp.send("Page.captureScreenshot", params);
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  console.log("screenshot", path.basename(file), fs.statSync(file).size);
}

async function setViewport(cdp, width, height, mobile = false) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile,
    screenWidth: width, screenHeight: height
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
}

async function goto(cdp) {
  await cdp.send("Page.navigate", { url: "http://127.0.0.1:8765/" });
  await waitReady(cdp);
}

function collectErrors(cdp) {
  const errors = [];
  cdp.on("Runtime.exceptionThrown", (params) => errors.push({ type: "exception", text: params.exceptionDetails?.text }));
  cdp.on("Runtime.consoleAPICalled", (params) => {
    if (params.type === "error") errors.push({ type: "console", text: params.args?.map((a) => a.value || a.description).join(" ") });
  });
  cdp.on("Log.entryAdded", (params) => {
    if (params.entry?.level === "error") errors.push({ type: "log", text: params.entry.text });
  });
  return errors;
}

function brief(state) {
  if (!state) return state;
  return {
    state: state.state,
    paused: state.paused,
    percent: state.percent,
    currentTime: state.currentTime,
    cells: state.cells,
    checksum: state.targetChecksum,
    maxOffset: state.maxOffset,
    runId: state.runId,
    rafActive: state.rafActive,
    imageVisible: state.imageVisible,
    canvasVisible: state.canvasVisible,
    finalised: state.finalised
  };
}

const page = await waitForEndpoint();
const cdp = new CDP(page.webSocketDebuggerUrl);
const errors = collectErrors(cdp);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
await cdp.send("Emulation.setEmulatedMedia", { features: [] });

await setViewport(cdp, 1440, 900, false);
await goto(cdp);
await sleep(650);
const midState = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
console.log("mid", JSON.stringify(brief(midState)));
await screenshot(cdp, path.join(OUT, "hero-desktop-mid.png"));

// Pause freezes the actual timeline; the visible console is intentionally gone.
await evaluate(cdp, "window.__PIXEL_APP__.pause()");
const pausedA = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
await sleep(500);
const pausedB = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
console.log("pause-freeze", JSON.stringify({ a: brief(pausedA), b: brief(pausedB), label: await evaluate(cdp, "document.getElementById('phase-label').textContent"), controls: await evaluate(cdp, "document.querySelectorAll('.art-controls, .interaction-hint').length") }));
await evaluate(cdp, "window.__PIXEL_APP__.resume()");
await sleep(6300);
const completeState = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
console.log("complete", JSON.stringify(brief(completeState)));
await screenshot(cdp, path.join(OUT, "desktop.png"));
await screenshot(cdp, path.join(OUT, "desktop-full.png"), true);

// Mouse disturbance on a dense part of the mark, then return.
const point = await evaluate(cdp, `(() => { const r = document.getElementById('art-stage').getBoundingClientRect(); return { x: r.left + r.width * 0.26, y: r.top + r.height * 0.56 }; })()`);
await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, button: "none" });
await sleep(320);
const interactive = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
await screenshot(cdp, path.join(OUT, "desktop-interactive.png"));
await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, button: "none" });
await sleep(1200);
const returned = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
console.log("mouse", JSON.stringify({ interactive: brief(interactive), returned: brief(returned) }));

// Engine-only local pulse and strength changes remain available without a console.
await evaluate(cdp, "window.__PIXEL_APP__.pulse()");
await sleep(400);
const deconstructed = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
await sleep(1500);
const deconstructedReturned = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
console.log("deconstruct", JSON.stringify({ deconstructed: brief(deconstructed), returned: brief(deconstructedReturned) }));

await evaluate(cdp, "window.__PIXEL_APP__.setStrength('high')");
const strength = await evaluate(cdp, "window.__PIXEL_APP__.getState().strength");
console.log("strength", JSON.stringify({ value: strength, ui: await evaluate(cdp, "document.querySelectorAll('[data-strength]').length") }));

// Five rapid replays.
const beforeReplays = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
for (let i = 0; i < 5; i += 1) {
  await evaluate(cdp, "window.__PIXEL_APP__.replay()");
  await sleep(90);
}
await sleep(6800);
const afterFive = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
const domReport = await evaluate(cdp, `(() => ({
  state: document.body.dataset.pageState,
  stageClass: document.getElementById('art-stage').className,
  images: document.querySelectorAll('#art-stage img').length,
  canvases: document.querySelectorAll('#art-stage canvas').length,
  bodyScrollWidth: document.body.scrollWidth,
  docScrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
  imageOpacity: getComputedStyle(document.getElementById('final-image')).opacity,
  canvasOpacity: getComputedStyle(document.getElementById('logo-canvas')).opacity,
  visibleSections: [...document.querySelectorAll('main > section')].map((s) => ({ id: s.id, h: Math.round(s.getBoundingClientRect().height) }))
}))()`);
console.log("replays", JSON.stringify({ before: brief(beforeReplays), after: brief(afterFive), checksumStable: beforeReplays.targetChecksum === afterFive.targetChecksum }));
console.log("dom", JSON.stringify(domReport));

// CTA actually scrolls to the works section.
await evaluate(cdp, "window.scrollTo(0,0)");
await evaluate(cdp, "document.querySelector('.hero-actions .button-solid').click()");
await sleep(600);
const ctaScroll = await evaluate(cdp, `({ y: Math.round(scrollY), worksTop: Math.round(document.getElementById('works').getBoundingClientRect().top), hash: location.hash })`);
console.log("cta-scroll", JSON.stringify(ctaScroll));

// Clicking the artwork itself is the visible replay path.
await evaluate(cdp, "window.scrollTo(0,0)");
const beforeStageClick = await evaluate(cdp, "window.__PIXEL_APP__.getState().runId");
await evaluate(cdp, "document.getElementById('art-stage').click()");
await sleep(350);
const afterStageClick = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
console.log("stage-click-replay", JSON.stringify({ before: beforeStageClick, after: afterStageClick.runId, state: afterStageClick.state }));

// Reduced motion in a fresh navigation.
await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await goto(cdp);
await sleep(500);
const reduced = await evaluate(cdp, `({ state: window.__PIXEL_APP__.getState(), phase: document.getElementById('phase-label').textContent, imageOpacity: getComputedStyle(document.getElementById('final-image')).opacity, stageLabel: document.getElementById('art-stage').getAttribute('aria-label'), carousel: window.__WORKS_CAROUSEL__.getState() })`);
console.log("reduced", JSON.stringify({ state: brief(reduced.state), phase: reduced.phase, imageOpacity: reduced.imageOpacity, stageLabel: reduced.stageLabel, carousel: reduced.carousel }));
await screenshot(cdp, path.join(OUT, "desktop-reduced.png"));

// Tablet viewport.
await cdp.send("Emulation.setEmulatedMedia", { features: [] });
await setViewport(cdp, 768, 1024, false);
await goto(cdp);
await sleep(6300);
const tablet = await evaluate(cdp, `({ sw: document.documentElement.scrollWidth, iw: innerWidth, state: window.__PIXEL_APP__.getState(), heroH: Math.round(document.getElementById('top').getBoundingClientRect().height), copyLeft: Math.round(document.querySelector('.hero-copy').getBoundingClientRect().left), artTop: Math.round(document.querySelector('.hero-art').getBoundingClientRect().top), artH: Math.round(document.querySelector('.hero-art').getBoundingClientRect().height) })`);
console.log("tablet", JSON.stringify({ sw: tablet.sw, iw: tablet.iw, state: brief(tablet.state), heroH: tablet.heroH, copyLeft: tablet.copyLeft, artTop: tablet.artTop, artH: tablet.artH }));
await screenshot(cdp, path.join(OUT, "tablet.png"));
await screenshot(cdp, path.join(OUT, "tablet-full.png"), true);

// Mobile viewport and touch perturbation.
await setViewport(cdp, 390, 844, true);
await goto(cdp);
await sleep(6300);
const mobile = await evaluate(cdp, `({ sw: document.documentElement.scrollWidth, iw: innerWidth, state: window.__PIXEL_APP__.getState(), heroH: Math.round(document.getElementById('top').getBoundingClientRect().height), artTop: Math.round(document.querySelector('.hero-art').getBoundingClientRect().top), artH: Math.round(document.querySelector('.hero-art').getBoundingClientRect().height) })`);
console.log("mobile", JSON.stringify({ sw: mobile.sw, iw: mobile.iw, state: brief(mobile.state), heroH: mobile.heroH, artTop: mobile.artTop, artH: mobile.artH }));
await screenshot(cdp, path.join(OUT, "mobile.png"));
await screenshot(cdp, path.join(OUT, "mobile-full.png"), true);

const touchPoint = await evaluate(cdp, `(() => { const r = document.getElementById('art-stage').getBoundingClientRect(); return { x: r.left + r.width * 0.26, y: r.top + r.height * 0.56 }; })()`);
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchPoint.x, y: touchPoint.y }] });
await sleep(320);
const touchInteractive = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
await sleep(1200);
const touchReturned = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
const beforeTap = await evaluate(cdp, "window.__PIXEL_APP__.getState().runId");
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchPoint.x, y: touchPoint.y }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await sleep(350);
const afterTap = await evaluate(cdp, "window.__PIXEL_APP__.getState()");
console.log("touch", JSON.stringify({ interactive: brief(touchInteractive), returned: brief(touchReturned), tapReplay: afterTap.runId > beforeTap, tapState: afterTap.state }));

// Hidden easter egg (three activations) and escape.
await evaluate(cdp, "document.getElementById('gap-trigger').click(); document.getElementById('gap-trigger').click(); document.getElementById('gap-trigger').click();");
await sleep(300);
const eggOpen = await evaluate(cdp, `({ hidden: document.getElementById('gap-dweller').hidden, expanded: document.getElementById('gap-trigger').getAttribute('aria-expanded') })`);
await screenshot(cdp, path.join(OUT, "mobile-dweller.png"));
await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await sleep(200);
const eggClosed = await evaluate(cdp, `({ hidden: document.getElementById('gap-dweller').hidden, expanded: document.getElementById('gap-trigger').getAttribute('aria-expanded') })`);
console.log("egg", JSON.stringify({ eggOpen, eggClosed }));

console.log("errors", JSON.stringify(errors));
cdp.close();

try { process.kill(-chrome.pid, "SIGKILL"); } catch {}
