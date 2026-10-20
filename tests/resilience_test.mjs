import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = "D:\\codex项目\\网站模板测试\\2";
const OUT = path.join(ROOT, ".impeccable", "review");
const PORT = 9335;
const PROFILE = path.join(ROOT, "tests", ".chrome-profile-resilience");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
  "--disable-background-networking", "--disable-sync", "--window-size=1440,900", "about:blank"
], { detached: true, stdio: "ignore" });
chrome.unref();

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (err) { reject(err); } });
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
    await new Promise((r) => setTimeout(r, 200));
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "eval failed");
  return result.result.value;
}

async function navigate(cdp, url = "http://127.0.0.1:8765/") {
  await cdp.send("Page.navigate", { url });
  await sleep(1800);
}

async function shot(cdp, name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(result.data, "base64"));
  console.log("screenshot", name, fs.statSync(path.join(OUT, name)).size);
}

const page = await waitForEndpoint();
const cdp = new CDP(page.webSocketDebuggerUrl);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900 });

// Normal phase sequence and intermediate states.
await cdp.send("Network.setBlockedURLs", { urls: [] });
await navigate(cdp);
await evaluate(cdp, `
  window.__phaseLog = [];
  window.__phaseTimer = setInterval(() => {
    const state = document.body.dataset.pageState;
    if (state && window.__phaseLog[window.__phaseLog.length - 1] !== state) window.__phaseLog.push(state);
  }, 80);
`);
await sleep(1800);
await shot(cdp, "phase-outline-1.png");
await sleep(900);
await shot(cdp, "phase-outline-2.png");
await sleep(900);
await shot(cdp, "phase-rearrange.png");
await sleep(2700);
const phaseLog = await evaluate(cdp, "window.__phaseLog");
const finalNormal = await evaluate(cdp, "({ state: document.body.dataset.pageState, opacity: getComputedStyle(document.getElementById('final-image')).opacity })");
console.log("phase-log", JSON.stringify(phaseLog));
console.log("final-normal", JSON.stringify(finalNormal));

// Pause then resume: currentTime must continue from the frozen point.
await cdp.send("Network.setBlockedURLs", { urls: [] });
await navigate(cdp);
await sleep(550);
await evaluate(cdp, "window.__PIXEL_APP__.pause()");
const pausedA = await evaluate(cdp, "window.__PIXEL_APP__.getState().currentTime");
await sleep(500);
const pausedB = await evaluate(cdp, "window.__PIXEL_APP__.getState().currentTime");
await evaluate(cdp, "window.__PIXEL_APP__.resume()");
await sleep(300);
const resumed = await evaluate(cdp, "window.__PIXEL_APP__.getState().currentTime");
console.log("resume", JSON.stringify({ pausedA, pausedB, resumed, advanced: resumed > pausedB }));

// Fallback: blocked artwork image.
await cdp.send("Network.setBlockedURLs", { urls: ["*logo-mark.png*"] });
await navigate(cdp);
const imageFailure = await evaluate(cdp, `({
  stage: document.getElementById('art-stage').className,
  errorDisplay: getComputedStyle(document.querySelector('.art-error')).display,
  pageText: document.querySelector('h1').textContent.trim(),
  controls: document.querySelectorAll('.art-controls, .interaction-hint').length,
  stageLabel: document.getElementById('art-stage').getAttribute('aria-label'),
  overflow: document.documentElement.scrollWidth <= innerWidth
})`);
console.log("image-failure", JSON.stringify(imageFailure));

// Fallback: blocked target data.
await cdp.send("Network.setBlockedURLs", { urls: ["*logo-data.js*"] });
await navigate(cdp);
const dataFailure = await evaluate(cdp, `({
  state: window.__PIXEL_APP__ ? window.__PIXEL_APP__.getState().state : 'no-api',
  stage: document.getElementById('art-stage').className,
  imageOpacity: getComputedStyle(document.getElementById('final-image')).opacity,
  phase: document.getElementById('phase-label').textContent,
  overflow: document.documentElement.scrollWidth <= innerWidth
})`);
console.log("data-failure", JSON.stringify(dataFailure));

// Fallback: blocked application script.
await cdp.send("Network.setBlockedURLs", { urls: ["*main.js*"] });
await navigate(cdp);
await sleep(3400);
const jsFailure = await evaluate(cdp, `({
  htmlClass: document.documentElement.className,
  imageOpacity: getComputedStyle(document.getElementById('final-image')).opacity,
  controls: document.querySelectorAll('.art-controls, .interaction-hint').length,
  pageText: document.querySelector('h1').textContent.trim(),
  carousel: document.getElementById('works-carousel').hidden,
  fallback: document.getElementById('works-fallback').hidden,
  overflow: document.documentElement.scrollWidth <= innerWidth
})`);
console.log("js-failure", JSON.stringify(jsFailure));

// Fallback: component script fails; the six works remain as a text list.
await cdp.send("Network.setBlockedURLs", { urls: ["*circular-carousel.js*"] });
await navigate(cdp);
await sleep(1200);
const carouselFailure = await evaluate(cdp, `({
  carouselHidden: document.getElementById('works-carousel').hidden,
  fallbackHidden: document.getElementById('works-fallback').hidden,
  links: document.querySelectorAll('#works-fallback a').length,
  enhanced: document.getElementById('works').classList.contains('is-enhanced'),
  overflow: document.documentElement.scrollWidth <= innerWidth
})`);
console.log("carousel-failure", JSON.stringify(carouselFailure));

cdp.close();
try { process.kill(-chrome.pid, "SIGKILL"); } catch {}
