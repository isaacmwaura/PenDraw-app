# Security and deployment scope

PenDraw's mirror is intended for a trusted local network. The relay currently has no authentication or transport encryption. Anyone who can reach it can join and edit the board. Do not publish the relay directly to the internet or forward its port from your router.

The Windows download is unsigned. Obtain it from this repository's release page and compare the supplied SHA-256 checksum. A checksum establishes file identity, not safety certification.

The October 2026 dependency audit found remaining advisories in the Excalidraw dependency tree, including Sass/Chokidar/Braces and Mermaid/KaTeX. The public build updates compatible dependencies, including Nano ID and Lodash, but does not claim a clean audit. Sass dependencies are build tooling; the browser bundle also includes upstream diagram components. Avoid opening untrusted content. Run `npm audit` when evaluating the source, since advisories and upstream fixes change over time.

Report vulnerabilities through GitHub's private vulnerability reporting for this repository when enabled. Do not include credentials, personal drawings or other private data in public issues.
