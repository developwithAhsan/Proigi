import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { resolve } from "node:path";

const root = process.cwd();
const html = await readFile(resolve(root, "index.html"), "utf8");
const config = JSON.parse(await readFile(resolve(root, "vercel.json"), "utf8"));

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) {
  throw new Error("Duplicate HTML ids: " + [...new Set(duplicateIds)].join(", "));
}

const idSet = new Set(ids);
const referencedIds = new Set();
for (const match of html.matchAll(/\$\(["']([^"']+)["']\)|getElementById\(["']([^"']+)["']\)/g)) {
  referencedIds.add(match[1] ?? match[2]);
}
const missingIds = [...referencedIds].filter(id => !idSet.has(id));
if (missingIds.length) {
  throw new Error("JavaScript references missing HTML ids: " + missingIds.join(", "));
}

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
if (inlineScripts.length !== 1) {
  throw new Error("Expected exactly one inline application script; found " + inlineScripts.length);
}
new vm.Script(inlineScripts[0][1], { filename: "index.html:inline-script" });

if (config.framework !== null || config.buildCommand !== "" || config.installCommand !== "" || config.outputDirectory !== ".") {
  throw new Error("vercel.json must keep the plain static-site settings: Other, no build/install, root output.");
}

for (const required of ["gameFrame", "openStandalone", "hostRoom", "joinRoom", "releaseStatus"]) {
  if (!idSet.has(required)) throw new Error("Missing required site feature element: " + required);
}
if (!html.includes('allow="webgpu;')) throw new Error("Browser game iframe must grant WebGPU permission.");
if (!html.includes("https://openigi.com/")) throw new Error("OpenIGI browser client origin is missing.");

console.log("Proigi static-site checks passed.");
console.log(`Checked ${ids.length} unique HTML ids, ${inlineScripts.length} inline script, and Vercel static config.`);
