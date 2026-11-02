import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const TMP = join(tmpdir(), "proigi-openigi-web-" + process.pid);
const VERSION = "0.6.1";
const SOURCE_REPO = "developwithAhsan/OpenIGI";
const SOURCE_COMMIT = "719938d4413a9f7ffd408519c066091edcedf906";
const UPSTREAM_TAG_OBJECT = "abff70ce61900868619381c5b1b58a7efb302815";
const ARCHIVE_URL = "https://github.com/OpenIGI/OpenIGI/releases/download/v" + VERSION + "/openigi-web-" + VERSION + ".tar.gz";
const ARCHIVE_SIZE = 49609447;
const ARCHIVE_SHA256 = "a3fc41eb836edc8a964e4305d562dfcde1d1a9afa63772023f0c3e9ed91d426f";

function log(message) {
  console.log("[proigi-build] " + message);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "Proigi-static-build"
    },
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) {
    throw new Error("GitHub verification failed (" + response.status + ") for " + url);
  }
  return response.json();
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0) resolvePromise();
      else reject(new Error(command + " exited with code " + code));
    });
  });
}

async function removeCompressedSidecars(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await removeCompressedSidecars(path);
    } else if (entry.isFile() && (entry.name.endsWith(".br") || entry.name.endsWith(".gz"))) {
      await rm(path, { force: true });
    }
  }
}

function replaceExactly(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) !== -1) {
    throw new Error("The pinned OpenIGI runtime changed; cannot safely apply " + label + ".");
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

async function patchBrowserRuntime() {
  const filesPath = join(DIST, "game-files.js");
  let files = await readFile(filesPath, "utf8");
  const prefetchMethod = [
    "    async prefetchAll(onProgress = () => {}) {",
    "      const cache = await dataCache();",
    "      if (!cache) throw new Error('This browser cannot store downloaded game files. Enable site storage and try again.');",
    "      try { await navigator.storage?.persist?.(); } catch {}",
    "      const estimate = await navigator.storage?.estimate?.().catch(() => null);",
    "      const order = name => Number(name.match(/(\\d+)$/)?.[1] ?? 0);",
    "      const names = Object.keys(index.bundles).sort((a, b) => {",
    "        if (a === 'base') return b === 'base' ? 0 : -1;",
    "        if (b === 'base') return 1;",
    "        return order(a) - order(b) || a.localeCompare(b);",
    "      });",
    "      let total = 0;",
    "      let missing = 0;",
    "      for (const name of names) {",
    "        const bundle = index.bundles[name];",
    "        total += bundle.size;",
    "        if (!(await cache.match(new URL(bundle.url, base).href))) missing += bundle.size;",
    "      }",
    "      const available = estimate?.quota ? estimate.quota - (estimate.usage ?? 0) : Infinity;",
    "      if (Number.isFinite(available) && available < missing) {",
    "        throw new Error('Not enough browser storage for all game files. Free at least ' + (missing / 1048576).toFixed(0) + ' MB, then reload and try again.');",
    "      }",
    "      let done = 0;",
    "      for (const name of names) {",
    "        const bundle = index.bundles[name];",
    "        const url = new URL(bundle.url, base).href;",
    "        if (await cache.match(url)) {",
    "          done += bundle.size;",
    "          onProgress(done, total, name);",
    "          continue;",
    "        }",
    "        await keep(name, got => onProgress(done + got, total, name), true);",
    "        done += bundle.size;",
    "        onProgress(done, total, name);",
    "      }",
    "    },",
    ""
  ].join("\\n");
  files = replaceExactly(files, "    async prefetch() {", prefetchMethod + "    async prefetch() {", "full game-data preloader");
  const oldKeep = [
    "  function keep(name) {",
    "    if (!kept.has(name)) {",
    "      kept.set(name, (async () => {",
    "        const url = new URL(index.bundles[name].url, base).href;",
    "        const cache = await dataCache();",
    "        if (await cache?.match(url)) return null;",
    "        const bytes = await downloadChecked(name);",
    "        return (await store(url, bytes)) ? null : bytes;",
    "      })());",
    "      kept.get(name).catch(() => kept.delete(name));",
    "    }",
    "    return kept.get(name);",
    "  }"
  ].join("\\n");
  const newKeep = [
    "  function keep(name, report, requireCache = false) {",
    "    if (!kept.has(name)) {",
    "      kept.set(name, (async () => {",
    "        const url = new URL(index.bundles[name].url, base).href;",
    "        const cache = await dataCache();",
    "        if (await cache?.match(url)) return null;",
    "        const bytes = await downloadChecked(name, report);",
    "        const saved = await store(url, bytes);",
    "        if (requireCache && !saved) throw new Error('The browser could not save every game file. Free device storage, then reload and retry.');",
    "        return saved ? null : bytes;",
    "      })());",
    "      kept.get(name).catch(() => kept.delete(name));",
    "    }",
    "    return kept.get(name);",
    "  }"
  ].join("\\n");
  files = replaceExactly(files, oldKeep, newKeep, "verified cache writes");
  const oldDownloadChecked = [
    "  async function downloadChecked(name) {",
    "    const bundle = index.bundles[name];",
    "    const url = new URL(bundle.url, base).href;",
    "    const bytes = await download(url, bundle.size, got => source.onDownload?.(name, got, bundle.size));",
    "    if ((await sha256(bytes)) !== bundle.sha256) throw new Error(` + "`" + "${bundle.url} arrived damaged; reload to try again." + "`" + `);
    "    return bytes;",
    "  }"
  ].join("\\n");
  const newDownloadChecked = [
    "  async function downloadChecked(name, report) {",
    "    const bundle = index.bundles[name];",
    "    const url = new URL(bundle.url, base).href;",
    "    const bytes = await download(url, bundle.size, got => {",
    "      source.onDownload?.(name, got, bundle.size);",
    "      report?.(got, bundle.size);",
    "    });",
    "    if ((await sha256(bytes)) !== bundle.sha256) throw new Error(` + "`" + "${bundle.url} arrived damaged; reload to try again." + "`" + `);
    "    return bytes;",
    "  }"
  ].join("\\n");
  files = replaceExactly(files, oldDownloadChecked, newDownloadChecked, "download progress and SHA-256 verification");
  await writeFile(filesPath, files);
  const mainPath = join(DIST, "main.js");
  let main = await readFile(mainPath, "utf8");
  const oldLoad = [
    "  const read = await files.load(source, fs, GAME_ROOT, (done, total) =>",
    "    progress(source.hosted ? 'Unpacking game files' : 'Reading game files', total ? done / total : 0, `${megabytes(done)} of ${megabytes(total)} MB`));",
    "  console.log(`Read ${read.files} files; ${read.deferred} wait for their missions.`);",
    "  if (source.hosted) source.onDownload = null;"
  ].join("\\n");
  const newLoad = [
    "  if (source.hosted) {",
    "    await source.prefetchAll((done, total, name) =>",
    "      progress('Downloading all game data · ' + name, total ? done / total : 1, megabytes(done) + ' of ' + megabytes(total) + ' MB cached'));",
    "  }",
    "  const read = await files.load(source, fs, GAME_ROOT, (done, total) =>",
    "    progress(source.hosted ? 'Preparing game files' : 'Reading game files', total ? done / total : 0, `${megabytes(done)} of ${megabytes(total)} MB`));",
    "  console.log(`Read ${read.files} files; ${read.deferred} large mission files are ready in the verified browser cache.`);",
    "  if (source.hosted) source.onDownload = null;"
  ].join("\\n");
  main = replaceExactly(main, oldLoad, newLoad, "download-before-engine-start flow");
  await writeFile(mainPath, main);
}

async function countFiles(directory) {
  let files = 0;
  let bytes = 0;
  let wasm = 0;
  let js = 0;
  async function visit(at) {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const info = await stat(path);
        files++;
        bytes += info.size;
        if (entry.name.endsWith(".wasm")) wasm++;
        if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) js++;
        if (info.size > 100 * 1024 * 1024) {
          throw new Error("Vercel static-file limit risk: " + relative(directory, path) + " is larger than 100 MB.");
        }
      }
    }
  }
  await visit(directory);
  return { files, bytes, wasm, js };
}

async function main() {
  await rm(TMP, { recursive: true, force: true });
  await rm(DIST, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  await mkdir(DIST, { recursive: true });

  log("Verifying the Proigi OpenIGI fork revision...");
  const fork = await fetchJson("https://api.github.com/repos/" + SOURCE_REPO + "/commits/master");
  if (fork.sha !== SOURCE_COMMIT) {
    throw new Error("The OpenIGI fork master moved to " + fork.sha + ". Review and pin a matching web release before deploying.");
  }

  const tag = await fetchJson("https://api.github.com/repos/OpenIGI/OpenIGI/git/tags/" + UPSTREAM_TAG_OBJECT);
  if (tag.object?.sha !== SOURCE_COMMIT) {
    throw new Error("The pinned OpenIGI web release no longer matches the source commit in the Proigi fork.");
  }

  log("Source verified: " + SOURCE_REPO + "@" + SOURCE_COMMIT);
  log("Downloading the compiled WebAssembly/WebGPU client v" + VERSION + "...");
  const response = await fetch(ARCHIVE_URL, {
    headers: { "User-Agent": "Proigi-static-build" },
    redirect: "follow",
    signal: AbortSignal.timeout(10 * 60 * 1000)
  });
  if (!response.ok || !response.body) {
    throw new Error("Could not download OpenIGI web runtime (" + response.status + ").");
  }

  const archive = join(TMP, "openigi-web-" + VERSION + ".tar.gz");
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));

  const downloaded = await stat(archive);
  if (downloaded.size !== ARCHIVE_SIZE) {
    throw new Error("OpenIGI package size mismatch. Expected " + ARCHIVE_SIZE + " bytes; received " + downloaded.size + ".");
  }

  const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
  if (digest !== ARCHIVE_SHA256) {
    throw new Error("OpenIGI package SHA-256 mismatch. Refusing to deploy an unverified game runtime.");
  }

  log("Package integrity verified. Extracting the game runtime into dist/...");
  await run("tar", ["-xzf", archive, "-C", DIST]);
  log("Applying the black-screen fix and full-download-before-launch flow...");
  await patchBrowserRuntime();

  const builtIndexPath = join(DIST, "index.html");
  const builtIndex = await readFile(builtIndexPath, "utf8");
  const importMapMatch = builtIndex.match(/<script type="importmap">([\s\S]*?)<\/script>/i);
  if (!importMapMatch || !importMapMatch[1].trim()) {
    throw new Error("The compiled OpenIGI package has no populated WebAssembly import map.");
  }
  JSON.parse(importMapMatch[1]);

  const proigiIndex = await readFile(join(ROOT, "index.html"), "utf8");
  if (!proigiIndex.includes("<!-- OPENIGI_IMPORT_MAP -->")) {
    throw new Error("Proigi index is missing the OpenIGI runtime import-map insertion point.");
  }
  const finalIndex = proigiIndex.replace("<!-- OPENIGI_IMPORT_MAP -->", importMapMatch[0]);
  await import("node:fs/promises").then(fs => fs.writeFile(builtIndexPath, finalIndex));

  // Vercel applies its own HTTP compression. Remove Apache-style .br/.gz sidecars so the CDN cannot
  // double-encode already-compressed files; raw WASM/JS assets remain available with explicit MIME types.
  await removeCompressedSidecars(DIST);

  await copyFile(join(ROOT, "OPENIGI-LICENSE-GPL-3.0.txt"), join(DIST, "OPENIGI-LICENSE-GPL-3.0.txt"));
  await copyFile(join(ROOT, "manifest.webmanifest"), join(DIST, "manifest.webmanifest"));
  await import("node:fs/promises").then(fs => fs.writeFile(join(DIST, "proigi-build.json"), JSON.stringify({ version: VERSION, sourceRepo: SOURCE_REPO, sourceCommit: SOURCE_COMMIT, archiveSha256: ARCHIVE_SHA256, runtimePatch: "download-before-boot-v1" }, null, 2) + "\n"));

  const mustExist = [
    "index.html",
    "main.js",
    "game-files.js",
    "user-files.js",
    "rtc.js",
    "platform.js",
    "audio.js",
    "wgpu-bridge.js",
    "host-assets.json",
    "_framework"
  ];
  for (const item of mustExist) {
    const path = join(DIST, item);
    try {
      await stat(path);
    } catch {
      throw new Error("The OpenIGI web package is incomplete: missing " + item);
    }
  }

  const totals = await countFiles(DIST);
  if (totals.wasm < 1 || totals.js < 3) {
    throw new Error("The extracted web runtime is incomplete (expected WebAssembly and JavaScript engine files).");
  }
  log("Build ready: " + totals.files + " files, " + (totals.bytes / 1048576).toFixed(1) + " MB, " + totals.wasm + " WASM modules.");
  log("The browser game is served from this Proigi deployment; there is no iframe or external game page.");
  await rm(TMP, { recursive: true, force: true });
}

main().catch(error => {
  console.error("[proigi-build] ERROR: " + (error?.stack || error));
  process.exitCode = 1;
});
