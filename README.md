# Proigi

A lightweight portal for the Project I.G.I. browser client and OpenIGI desktop releases.

## What the site does

- **Browser play:** embeds the live OpenIGI browser client from [openigi.com](https://openigi.com/). The game engine and browser game data remain on OpenIGI's servers; Proigi does not mirror or bundle them.
- **Co-op entry points:** the host button opens OpenIGI with `?host`; the join form opens it with `?join=CODE`. An optional callsign is passed as `?name=`. Public rooms can be browsed in the game's Co-op screen.
- **Desktop downloads:** the launcher buttons link to OpenIGI's official download/install endpoints. The standalone game-package links are refreshed from the upstream GitHub latest-release API, with verified v0.6.1 links as a fallback.
- **Responsive static frontend:** no build tool, framework, database or environment variables are required.

## Deploy on Vercel

Import `developwithAhsan/Proigi` and use the repository root. The committed `vercel.json` sets the static-site configuration:

- Framework preset: **Other** (framework `null`)
- Root directory: `/` (repository root)
- Build command: empty / disabled
- Install command: empty / skipped
- Output directory: `.` (repository root)

This is intentional: the project is plain HTML, CSS and JavaScript, so there is no npm install or Vite/Next build to fail. Vercel serves the root `index.html` and its static files directly. Keep HTTPS enabled because WebGPU requires a secure context.

To import it: Vercel Dashboard → Add New → Project → Import Git Repository → `developwithAhsan/Proigi` → keep the settings above → Deploy. After the first import, pushes to `main` should trigger automatic production deployments when the Git integration is enabled.

## Browser and game requirements

The published OpenIGI browser build uses WebGPU and currently documents the first six Project I.G.I. missions with the original graphics preset. The browser client downloads its hosted data and caches it locally. If embedded content is blocked by a browser or the upstream host, use the **Open official client** or **Open separately** link.

The desktop game requires a Project I.G.I. installation that the player is entitled to use. The OpenIGI source repository does not contain the original commercial game's models, textures, sounds or mission data. Proigi does not host or distribute those files.

## Upstream project and attribution

- Browser client and project site: [OpenIGI](https://openigi.com/)
- Upstream source and releases: [OpenIGI/OpenIGI](https://github.com/OpenIGI/OpenIGI)
- User's source fork: [developwithAhsan/OpenIGI](https://github.com/developwithAhsan/OpenIGI)
- OpenIGI engine source license: [GNU GPL-3.0](https://github.com/OpenIGI/OpenIGI/blob/master/LICENSE)

Proigi is an independent portal, not an official publisher website and not affiliated with Innerloop Studios, Eidos or the game's publishers. Project I.G.I. names, marks and original game content remain with their respective rights holders. The Proigi page links to the upstream services rather than redistributing their engine or game data.
