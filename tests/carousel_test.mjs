import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = "D:\\codex项目\\网站模板测试\\2";
const OUT = path.join(ROOT, ".impeccable", "review");
const PORT = 9338;
const PROFILE = path.join(ROOT, "tests", ".chrome-profile-carousel");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
  "--disable-background-networking", "--disable-sync", "--window-size=1440,900", "about:blank"
], { detached: true, stdio: "ignore" });
chrome.unref();

const getJSON = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => { try { resolve(JSON.parse(data)); } catch (error) { reject(error); } });
  }).on("error", reject);
});

async function pageTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find((item) => item.type === "page");
      if (page) return page;
    } catch {}
    await sleep(200);
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
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners.get(message.method) || []) listener(message.params);
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

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Evaluation failed");
  return result.result.value;
}

async function waitReady(cdp) {
  for (let i = 0; i < 120; i += 1) {
    const ready = await evaluate(cdp, "document.readyState === 'complete' && Boolean(window.__WORKS_CAROUSEL__) && window.__WORKS_CAROUSEL__.getState().ready && Boolean(window.__PIXEL_APP__)");
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Carousel did not become ready");
}

async function screenshot(cdp, name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(result.data, "base64"));
  console.log("screenshot", name, fs.statSync(path.join(OUT, name)).size);
}

async function goto(cdp) {
  await cdp.send("Page.navigate", { url: "http://127.0.0.1:8765/" });
  await waitReady(cdp);
}

async function setViewport(cdp, width, height, mobile) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
}

async function key(cdp, k, code, vk, text = "") {
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  if (text) await cdp.send("Input.dispatchKeyEvent", { type: "char", key: k, code, text, unmodifiedText: text, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

async function mouseClick(cdp, x, y) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function cardCenter(cdp, index) {
  return evaluate(cdp, `(() => { const r = document.querySelector('.cc-card[data-index="${index}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
}

const page = await pageTarget();
const cdp = new CDP(page.webSocketDebuggerUrl);
const errors = [];
cdp.on("Runtime.exceptionThrown", (params) => errors.push({ type: "exception", text: params.exceptionDetails?.text }));
cdp.on("Runtime.consoleAPICalled", (params) => { if (params.type === "error") errors.push({ type: "console", text: params.args?.map((arg) => arg.value || arg.description).join(" ") }); });
cdp.on("Log.entryAdded", (params) => { if (params.entry?.level === "error") errors.push({ type: "log", text: params.entry.text }); });

await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
await setViewport(cdp, 1440, 900, false);
await goto(cdp);
await evaluate(cdp, "document.getElementById('works').scrollIntoView({ block: 'center' })");
await sleep(1400);

const initial = await evaluate(cdp, `(() => {
  const state = window.__WORKS_CAROUSEL__.getState();
  const stage = document.querySelector('.cc-stage').getBoundingClientRect();
  const card = document.querySelector('.cc-card[data-index="0"]').getBoundingClientRect();
  return {
    state,
    cards: document.querySelectorAll('.cc-card').length,
    fallbackHidden: document.getElementById('works-fallback').hidden,
    stageWidth: Math.round(stage.width),
    stageHeight: Math.round(stage.height),
    cardWidth: Math.round(card.width),
    fit: getComputedStyle(document.querySelector('.cc-card img')).objectFit,
    active: document.querySelector('.cc-card.is-active')?.dataset.index,
    aria: document.querySelector('.cc-card[data-index="0"]').getAttribute('aria-label'),
    caption: document.querySelector('.cc-caption').innerText.replace(/\\n+/g, ' | '),
    indexButtons: document.querySelectorAll('.cc-index-button').length,
    currentIndex: document.querySelector('.cc-index-button[aria-current="true"]')?.textContent,
    openHref: document.querySelector('.cc-open').getAttribute('href')
  };
})()`);
console.log("initial", JSON.stringify(initial));
await screenshot(cdp, "carousel-desktop.png");

// Auto rotation runs while the stage is idle.
const autoA = await evaluate(cdp, "window.__WORKS_CAROUSEL__.getState()");
await sleep(700);
const autoB = await evaluate(cdp, "window.__WORKS_CAROUSEL__.getState()");
console.log("auto", JSON.stringify({ a: autoA.angle, b: autoB.angle, moved: autoA.angle !== autoB.angle, auto: autoA.auto || autoB.auto }));

// Pointer hover stops it; a click centres and flips the active card.
await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 720, y: 520, button: "none" });
await sleep(350);
const hoverPaused = await evaluate(cdp, "window.__WORKS_CAROUSEL__.getState()");
await evaluate(cdp, "window.__WORKS_CAROUSEL__.pause(); window.__WORKS_CAROUSEL__.goTo(0)");
await sleep(650);
const center0 = await cardCenter(cdp, 0);
await mouseClick(cdp, center0.x, center0.y);
await sleep(850);
const flipped = await evaluate(cdp, `({
  state: window.__WORKS_CAROUSEL__.getState(),
  classFlipped: document.querySelector('.cc-card[data-index="0"]').classList.contains('is-flipped'),
  pressed: document.querySelector('.cc-card[data-index="0"]').getAttribute('aria-pressed'),
  back: document.querySelector('.cc-card[data-index="0"] .cc-back-title').textContent,
  caption: document.querySelector('.cc-caption').innerText.replace(/\\n+/g, ' | ')
})`);
console.log("flip", JSON.stringify({ hoverPaused: hoverPaused.auto, flipped }));
await screenshot(cdp, "carousel-flip.png");

await mouseClick(cdp, center0.x, center0.y);
await sleep(760);
const unflipped = await evaluate(cdp, "({ state: window.__WORKS_CAROUSEL__.getState(), flipped: document.querySelectorAll('.cc-card.is-flipped').length })");
console.log("unflip", JSON.stringify(unflipped));

// Desktop arrows advance one work.
await evaluate(cdp, "document.querySelector('.cc-next').click()");
await sleep(720);
const arrowButton = await evaluate(cdp, "({ state: window.__WORKS_CAROUSEL__.getState(), active: document.querySelector('.cc-card.is-active')?.dataset.index })");
console.log("arrow-button", JSON.stringify(arrowButton));

// Index buttons jump directly to a work.
await evaluate(cdp, "document.querySelector('.cc-index-button[data-index=\"3\"]').click()");
await sleep(720);
const indexed = await evaluate(cdp, "({ state: window.__WORKS_CAROUSEL__.getState(), active: document.querySelector('.cc-card.is-active')?.dataset.index, current: document.querySelector('.cc-index-button[aria-current=\"true\"]')?.textContent, title: document.querySelector('.cc-caption-title').textContent })");
console.log("index", JSON.stringify(indexed));

// Keyboard: arrows move, Enter flips, Escape closes.
await evaluate(cdp, "document.querySelector('.cc-card[data-index=\"3\"]').focus()");
await key(cdp, "ArrowRight", "ArrowRight", 39);
await sleep(720);
const arrowed = await evaluate(cdp, "({ state: window.__WORKS_CAROUSEL__.getState(), active: document.querySelector('.cc-card.is-active')?.dataset.index, focused: document.activeElement?.dataset?.index })");
await key(cdp, "Enter", "Enter", 13, "\r");
await sleep(800);
const keyboardFlip = await evaluate(cdp, "({ flipped: window.__WORKS_CAROUSEL__.getState().flipped, pressed: document.querySelector('.cc-card.is-flipped')?.getAttribute('aria-pressed'), title: document.querySelector('.cc-card.is-flipped .cc-back-title')?.textContent })");
await key(cdp, "Escape", "Escape", 27);
await sleep(720);
const keyboardUnflip = await evaluate(cdp, "({ flipped: window.__WORKS_CAROUSEL__.getState().flipped, count: document.querySelectorAll('.cc-card.is-flipped').length })");
console.log("keyboard", JSON.stringify({ arrowed, keyboardFlip, keyboardUnflip }));

// Drag: movement above threshold rotates, does not flip, then snaps.
const activeIndex = await evaluate(cdp, "window.__WORKS_CAROUSEL__.getState().index");
const centerNow = await cardCenter(cdp, activeIndex);
await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: centerNow.x, y: centerNow.y, button: "none" });
await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: centerNow.x, y: centerNow.y, button: "left", clickCount: 1 });
for (let i = 1; i <= 4; i += 1) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: centerNow.x - 45 * i, y: centerNow.y, button: "left", buttons: 1 });
  await sleep(30);
}
await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: centerNow.x - 180, y: centerNow.y, button: "left", clickCount: 1 });
await sleep(950);
const dragged = await evaluate(cdp, "({ state: window.__WORKS_CAROUSEL__.getState(), flipped: document.querySelectorAll('.cc-card.is-flipped').length, active: document.querySelector('.cc-card.is-active')?.dataset.index })");
console.log("drag", JSON.stringify(dragged));

// captions=false removes the caption and the flip interaction.
await evaluate(cdp, "window.__WORKS_CAROUSEL__.setAttribute('captions', 'false')");
await sleep(250);
const captionsOff = await evaluate(cdp, `({
  state: window.__WORKS_CAROUSEL__.getState(),
  display: getComputedStyle(document.querySelector('.cc-caption')).display,
  pressed: document.querySelector('.cc-card').hasAttribute('aria-pressed')
})`);
const offIndex = await evaluate(cdp, "window.__WORKS_CAROUSEL__.getState().index");
const centerOff = await cardCenter(cdp, offIndex);
await mouseClick(cdp, centerOff.x, centerOff.y);
await sleep(760);
const noFlip = await evaluate(cdp, "({ flipped: window.__WORKS_CAROUSEL__.getState().flipped, count: document.querySelectorAll('.cc-card.is-flipped').length })");
await evaluate(cdp, "window.__WORKS_CAROUSEL__.setAttribute('captions', 'true')");
console.log("captions", JSON.stringify({ captionsOff, noFlip }));

// preset=flat is a real alternate layout, not a dead prop.
await evaluate(cdp, "window.__WORKS_CAROUSEL__.setAttribute('preset', 'flat')");
await sleep(350);
const flat = await evaluate(cdp, `({
  state: window.__WORKS_CAROUSEL__.getState(),
  perspective: getComputedStyle(document.querySelector('.cc-stage')).perspective,
  transform: document.querySelector('.cc-card').style.transform,
  ring: getComputedStyle(document.querySelector('.cc-ring')).transform
})`);
await evaluate(cdp, "window.__WORKS_CAROUSEL__.setAttribute('preset', 'cylinder')");
console.log("flat", JSON.stringify(flat));

// Reduced motion: no auto rotation, but manual flip still works.
await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await goto(cdp);
await evaluate(cdp, "document.getElementById('works').scrollIntoView({ block: 'center' })");
await sleep(700);
const reducedA = await evaluate(cdp, "window.__WORKS_CAROUSEL__.getState()");
await sleep(800);
const reducedB = await evaluate(cdp, "window.__WORKS_CAROUSEL__.getState()");
const reducedCenter = await cardCenter(cdp, 0);
await mouseClick(cdp, reducedCenter.x, reducedCenter.y);
await sleep(300);
const reducedFlip = await evaluate(cdp, "window.__WORKS_CAROUSEL__.getState().flipped");
console.log("reduced", JSON.stringify({ a: reducedA, b: reducedB, stable: reducedA.angle === reducedB.angle, flipped: reducedFlip }));
await screenshot(cdp, "carousel-reduced.png");

// Mobile: no page overflow, arrows retired, swipe/index remain.
await cdp.send("Emulation.setEmulatedMedia", { features: [] });
await setViewport(cdp, 390, 844, true);
await goto(cdp);
await evaluate(cdp, "document.getElementById('works').scrollIntoView({ block: 'center' })");
await sleep(850);
const mobile = await evaluate(cdp, `({
  sw: document.documentElement.scrollWidth,
  iw: innerWidth,
  state: window.__WORKS_CAROUSEL__.getState(),
  stage: Math.round(document.querySelector('.cc-stage').getBoundingClientRect().width),
  card: Math.round(document.querySelector('.cc-card[data-index="0"]').getBoundingClientRect().width),
  arrows: getComputedStyle(document.querySelector('.cc-arrow')).display,
  worksHeight: Math.round(document.getElementById('works').getBoundingClientRect().height),
  overflow: document.documentElement.scrollWidth <= innerWidth
})`);
console.log("mobile", JSON.stringify(mobile));
await screenshot(cdp, "carousel-mobile.png");
const mobileCenter = await cardCenter(cdp, 0);
await mouseClick(cdp, mobileCenter.x, mobileCenter.y);
await sleep(750);
const mobileFlip = await evaluate(cdp, `({
  flipped: window.__WORKS_CAROUSEL__.getState().flipped,
  backTitle: document.querySelector('.cc-card.is-flipped .cc-back-title')?.textContent,
  backHeight: Math.round(document.querySelector('.cc-card.is-flipped .cc-back-title').getBoundingClientRect().height),
  cardHeight: Math.round(document.querySelector('.cc-card.is-flipped').getBoundingClientRect().height)
})`);
console.log("mobile-flip", JSON.stringify(mobileFlip));
await screenshot(cdp, "carousel-mobile-flip.png");

// Tablet.
await setViewport(cdp, 768, 1024, false);
await goto(cdp);
await evaluate(cdp, "document.getElementById('works').scrollIntoView({ block: 'center' })");
await sleep(850);
const tablet = await evaluate(cdp, `({
  sw: document.documentElement.scrollWidth,
  iw: innerWidth,
  state: window.__WORKS_CAROUSEL__.getState(),
  stage: Math.round(document.querySelector('.cc-stage').getBoundingClientRect().width),
  stageH: Math.round(document.querySelector('.cc-stage').getBoundingClientRect().height),
  card: Math.round(document.querySelector('.cc-card[data-index="0"]').getBoundingClientRect().width),
  cardH: Math.round(document.querySelector('.cc-card[data-index="0"]').getBoundingClientRect().height),
  arrows: getComputedStyle(document.querySelector('.cc-arrow')).display,
  overflow: document.documentElement.scrollWidth <= innerWidth
})`);
console.log("tablet", JSON.stringify(tablet));
await screenshot(cdp, "carousel-tablet.png");

const failures = [];
const check = (name, condition) => {
  if (!condition) failures.push(name);
};
check("six cards", initial.cards === 6);
check("cover crop", initial.fit === "cover");
check("six index buttons", initial.indexButtons === 6);
check("open target", /study-01\.svg$/.test(initial.openHref || ""));
check("auto rotation", autoA.angle !== autoB.angle);
check("hover pause", hoverPaused.auto === false);
check("flip", flipped.state.flipped === 0 && flipped.pressed === "true");
check("unflip", unflipped.flipped === 0);
check("arrow button", arrowButton.state.index === 1);
check("index jump", indexed.state.index === 3 && indexed.current === "04");
check("keyboard arrow", arrowed.state.index === 4 && arrowed.focused === "4");
check("keyboard flip", keyboardFlip.flipped === 4);
check("keyboard escape", keyboardUnflip.flipped === null && keyboardUnflip.count === 0);
check("drag snap", dragged.state.index === 5 && dragged.flipped === 0);
check("captions off", captionsOff.state.captions === false && captionsOff.display === "none");
check("no flip without captions", noFlip.flipped === null);
check("flat preset", flat.state.preset === "flat" && flat.perspective === "none");
check("reduced motion stable", reducedA.angle === reducedB.angle && reducedA.auto === false);
check("reduced flip", reducedFlip === 0);
check("mobile overflow", mobile.overflow === true);
check("mobile arrows retired", mobile.arrows === "none");
check("tablet overflow", tablet.overflow === true);
check("tablet card fits stage", tablet.cardH <= tablet.stageH);
check("console errors", errors.length === 0);
if (failures.length) {
  throw new Error("Carousel checks failed: " + failures.join(", "));
}
console.log("checks", JSON.stringify({ passed: 24, failures: [] }));
console.log("errors", JSON.stringify(errors));
cdp.close();
try { process.kill(-chrome.pid, "SIGKILL"); } catch {}
