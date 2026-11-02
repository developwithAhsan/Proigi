# Proigi notices

The browser game runtime is the OpenIGI WebAssembly/WebGPU build. It is served as static assets from the Proigi deployment itself; it is not embedded in an iframe.

Pinned browser package: OpenIGI Web v0.6.1.
Source commit: `719938d4413a9f7ffd408519c066091edcedf906`.

That commit matches both the current `master` commit of https://github.com/developwithAhsan/OpenIGI and the commit referenced by the upstream OpenIGI `v0.6.1` release tag.

The build script verifies the source revision and the downloaded package SHA-256 before extraction. If the fork moves, the build fails until a matching web release has been reviewed and pinned.

OpenIGI source is licensed under GNU GPL version 3. The corresponding source repository and full license are linked in the site footer and included in the deployed output. OpenIGI's browser game-data files and room-signalling infrastructure remain on their existing upstream services; Proigi does not mirror the original commercial game data.
