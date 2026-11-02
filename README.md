# Proigi

Proigi is a custom Project I.G.I. game portal. The game does **not** run inside an iframe and does not redirect players to OpenIGI's website.

## How browser play works

1. The Vercel build downloads the OpenIGI WebAssembly/WebGPU browser package.
2. The build verifies its SHA-256 digest and confirms that the release source commit matches the current `master` revision of [developwithAhsan/OpenIGI](https://github.com/developwithAhsan/OpenIGI).
3. The browser package is extracted into Vercel's `dist/` output. Proigi's own `index.html`, page design, loader and game canvas are served from the Proigi domain.
4. When the player clicks **Download & Play**, Proigi downloads every bundle listed by the hosted game-data index before starting the engine. Each newly downloaded bundle is SHA-256 verified and saved in Cache Storage. If the browser cannot cache the complete data set or does not have enough storage, the game does not start and an actionable error is shown. Existing cached bundles are reused on later visits.
5. Only after the complete bundle set is available does the browser load the base installation into the WebAssembly file system and boot the game. Large mission files are unpacked from the already-downloaded cache when their mission is selected; they no longer need a network download during play.
6. The in-game Co-op screen uses OpenIGI's room system. The browser build uses WebRTC data channels and the existing OpenIGI master/room service; host and join options are passed to the same-site browser runtime.

The pinned version is OpenIGI Web v0.6.1 from commit `719938d4413a9f7ffd408519c066091edcedf906`. The user's OpenIGI fork currently points to that exact commit. The build fails intentionally if the fork moves, so a new engine release must be reviewed and pinned instead of silently mixing source and binary versions.

## Vercel setup

Import `developwithAhsan/Proigi` from GitHub, using the repository root. The committed `vercel.json` configures:

| Setting | Value |
|---|---|
| Framework preset | Other |
| Root directory | Repository root |
| Install command | Empty / skipped |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js | 22.x |

Vercel downloads and extracts the approximately 50 MB verified browser-runtime archive during the build. The output contains the complete browser-side game runtime, including WebAssembly, WebGPU bridge, renderer/audio/platform scripts, host assets and the custom Proigi page. Vercel serves the generated files as static assets from the Proigi domain.

The build removes Apache-style `.br` and `.gz` sidecars to avoid double-compression on Vercel; the original uncompressed WASM/JS assets remain and Vercel's CDN handles response compression. The WASM MIME type is set explicitly.

## Browser and game requirements

The game requires HTTPS, a current browser with WebGPU support, hardware acceleration, and enough browser storage for all hosted mission bundles. The first **Download & Play** can take time and use substantial data; progress is shown and the game starts only when all bundles are cached and verified. Later visits reuse the cache. The OpenIGI browser build documents Project I.G.I. missions 1–6 with the original graphics preset. It is not the full desktop remaster.

The OpenIGI browser package does not contain the original commercial game's mission data, models, textures or sounds. The browser runtime obtains the published game-data bundles from OpenIGI's existing data service (`data.openigi.com`) and caches them in the player's browser. Proigi does not copy or redistribute those commercial game-data files.

Co-op signalling and room discovery are handled by OpenIGI's existing room service (the browser code uses `master.openigi.com`). The room system is exposed by the upstream game UI; live availability depends on those upstream services and a compatible game build.

## Desktop downloads

Windows, Linux and macOS standalone packages and launcher links point to OpenIGI's official release assets. The page refreshes desktop package links from the upstream GitHub latest-release API.

## Source, license and attribution

- OpenIGI source fork used for the pinned build: https://github.com/developwithAhsan/OpenIGI
- Upstream OpenIGI project and releases: https://github.com/OpenIGI/OpenIGI
- Full GPL-3.0 license: [OPENIGI-LICENSE-GPL-3.0.txt](OPENIGI-LICENSE-GPL-3.0.txt)

The OpenIGI engine is distributed under GNU GPL-3.0. Its full license and source link are included in the site footer and deployed output. Proigi is an independent portal, not an official publisher website and not affiliated with Innerloop Studios, Eidos or the game's publishers.
