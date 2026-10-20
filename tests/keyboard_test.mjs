import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = "D:\\codex项目\\网站模板测试\\2";
const PORT = 9336;
const PROFILE = path.join(ROOT, "tests", ".chrome-profile-keyboard");
fs.mkdirSync(PROFILE, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
  "--disable-background-networking", "--window-size=1440,900", "about:blank"
], { detached: true, stdio: "ignore" });
chrome.unref();

const getJSON = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => { let d = ""; res.on("data", (c) => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on("error", reject);
});
async function pageTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find((x) => x.type === "page");
      if (page) return page;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("no page");
}
class CDP {
  constructor(url) {
    this.id = 0; this.pending = new Map(); this.ws = new WebSocket(url);
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener("open", res, { once: true });
      this.ws.addEventListener("error", rej, { once: true });
    });
    this.ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready; const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  close() { this.ws.close(); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (cdp, expression) => {
  const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
const key = async (cdp, k, code, vk) => {
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  if (k === "Enter") {
    await cdp.send("Input.dispatchKeyEvent", { type: "char", key: k, code, text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  } else if (k === " ") {
    await cdp.send("Input.dispatchKeyEvent", { type: "char", key: k, code, text: " ", unmodifiedText: " ", windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
};

const page = await pageTarget();
const cdp = new CDP(page.webSocketDebuggerUrl);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900 });
await cdp.send("Page.navigate", { url: "http://127.0.0.1:8765/" });
await sleep(1500);

await evaluate(cdp, "document.getElementById('art-stage').focus()");
await key(cdp, " ", "Space", 32);
await sleep(300);
const paused = await evaluate(cdp, "({ state: document.body.dataset.pageState, label: document.getElementById('phase-label').textContent, focused: document.activeElement.id })");
await key(cdp, " ", "Space", 32);
await sleep(400);
const resumed = await evaluate(cdp, "({ state: document.body.dataset.pageState, label: document.getElementById('phase-label').textContent, focused: document.activeElement.id })");

await evaluate(cdp, "document.getElementById('gap-trigger').focus()");
for (let i = 0; i < 3; i += 1) {
  await key(cdp, "Enter", "Enter", 13);
  await sleep(120);
}
await sleep(200);
const eggOpen = await evaluate(cdp, "({ hidden: document.getElementById('gap-dweller').hidden, focus: document.activeElement.id })");
await key(cdp, "Escape", "Escape", 27);
await sleep(200);
const eggClosed = await evaluate(cdp, "({ hidden: document.getElementById('gap-dweller').hidden, focus: document.activeElement.id })");
console.log("keyboard", JSON.stringify({ paused, resumed, eggOpen, eggClosed }));
cdp.close();
try { process.kill(-chrome.pid, "SIGKILL"); } catch {}
