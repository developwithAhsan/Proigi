import { readFile, readdir, stat } from "node:fs/promises";
import vm from "node:vm";
import { join, resolve } from "node:path";

const project = resolve(process.cwd());
const root = join(project, "dist");
const html = await readFile(join(root, "index.html"), "utf8");

if (html.toLowerCase().includes("<iframe") || html.includes("gameFrame") || html.includes("openStandalone")) {
  throw new Error("An embedded game frame was found. Proigi must render the game directly on its own canvas.");
}
if (!html.includes('<canvas id="view"') || !html.includes('<div id="landing">')) {
  throw new Error("The direct game canvas or Proigi landing shell is missing.");
}
if (!html.includes('<script type="module" src="main.js"></script>')) {
  throw new Error("OpenIGI's browser runtime is not loaded by the Proigi page.");
}

const importMapStart = html.indexOf('<script type="importmap">');
const importMapBodyStart = importMapStart < 0 ? -1 : html.indexOf(">", importMapStart) + 1;
const importMapEnd = importMapBodyStart < 0 ? -1 : html.indexOf("</script>", importMapBodyStart);
if (importMapStart < 0 || importMapEnd < 0) {
  throw new Error("The compiled WebAssembly import map is missing.");
}
const importMapText = html.slice(importMapBodyStart, importMapEnd).trim();
if (!importMapText) throw new Error("The WebAssembly import map is empty.");
JSON.parse(importMapText);

const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) {
  throw new Error("Duplicate HTML IDs: " + [...new Set(duplicates)].join(", "));
}
const idSet = new Set(ids);
const required = [
  "view", "landing", "play", "play-label", "status", "action", "loading",
  "progress", "progress-label", "progress-value", "change", "own", "clear",
  "gpu", "install-copy", "install-command", "discord-name", "discord-online",
  "discord-avatars", "github-stars", "hostRoom", "joinRoom", "roomCode"
];
for (const id of required) {
  if (!idSet.has(id)) throw new Error("Missing required runtime element: #" + id);
}

const inlineStart = html.indexOf("<script>");
const inlineEnd = inlineStart < 0 ? -1 : html.indexOf("</script>", inlineStart);
if (inlineStart < 0 || inlineEnd < 0) throw new Error("Proigi inline application script is missing.");
const inlineScript = html.slice(inlineStart + "<script>".length, inlineEnd);
new vm.Script(inlineScript, { filename: "dist/index.html:inline-script" });

for (const file of [
  "main.js", "game-files.js", "user-files.js", "rtc.js", "platform.js",
  "audio.js", "wgpu-bridge.js", "host-assets.json", "manifest.webmanifest",
  "OPENIGI-LICENSE-GPL-3.0.txt", "proigi-build.json"
]) {
  await stat(join(root, file));
}

const framework = join(root, "_framework");
const frameworkFiles = await readdir(framework);
if (!frameworkFiles.some(name => name.endsWith(".wasm"))) {
  throw new Error("No WebAssembly module exists under dist/_framework.");
}

async function countIframes(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) count += await countIframes(path);
    else if (entry.isFile() && entry.name.endsWith(".html")) {
      const text = await readFile(path, "utf8");
      count += text.toLowerCase().split("<iframe").length - 1;
    }
  }
  return count;
}
if (await countIframes(root)) {
  throw new Error("An iframe exists in the generated deployment output.");
}

const meta = JSON.parse(await readFile(join(root, "proigi-build.json"), "utf8"));
if (meta.sourceCommit !== "719938d4413a9f7ffd408519c066091edcedf906" || meta.version !== "0.6.1") {
  throw new Error("The game runtime is not built from the pinned OpenIGI source revision.");
}

const config = JSON.parse(await readFile(join(project, "vercel.json"), "utf8"));
if (config.framework !== null || config.buildCommand !== "npm run build" || config.installCommand !== "" || config.outputDirectory !== "dist") {
  throw new Error("Vercel settings do not match the required static game build.");
}

console.log("Proigi production checks passed.");
console.log("Verified native game canvas, WebAssembly runtime, import map, room controls, license, Vercel settings and no iframes.");
