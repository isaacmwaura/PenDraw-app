# Security and deployment scope

PenDraw's mirror is intended for a trusted local network. Built-in desktop sharing requires a random access key in its browser link. Anyone with that link and network access can view and edit the board. A fresh session identifier prevents old sockets joining a restarted host; bookmarks resolve to the new session. Neither the key nor the session makes plain HTTP encrypted. Do not expose sharing to the internet or forward port 4000 from your router.

Sharing is opt-in, starts off each launch, and stops on Stop sharing, New/Open or process exit. The access key persists for bookmarks, so someone with an old link can join future sessions when sharing is enabled. Only the shared scene and embedded browser assets are served; there is no general filesystem route. The optional developer Node relay still has no authentication. Use it only on a trusted network.

The portable Windows package includes a pinned Microsoft WebView2 fixed runtime. It does not update itself. Install newer PenDraw packages to receive runtime updates. The included runtime uses Microsoft's separate license and privacy terms and contains SmartScreen protection.

The Windows download is unsigned. Obtain it from this repository's release page and compare the supplied SHA-256 checksum. A checksum establishes file identity, not safety certification.

The October 2026 dependency audit found remaining advisories in the Excalidraw dependency tree, including Sass/Chokidar/Braces and Mermaid/KaTeX. The public build updates compatible dependencies, including Nano ID and Lodash, but does not claim a clean audit. Sass dependencies are build tooling; the browser bundle also includes upstream diagram components. Avoid opening untrusted content. Run `npm audit` when evaluating the source, since advisories and upstream fixes change over time.

Report vulnerabilities through GitHub's private vulnerability reporting for this repository when enabled. Do not include credentials, personal drawings or other private data in public issues.
