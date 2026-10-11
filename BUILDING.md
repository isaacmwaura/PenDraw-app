# Build PenDraw

## Browser

Install Node.js 24 with npm. From the repository root:

```sh
npm ci
npm run check
npm run build
npm start
```

`npm ci` installs the versions recorded in package-lock.json. The build produces `apps/pendraw/dist`. The server prints local editor and mirror addresses. `npm run dev` starts development servers instead.

## Windows desktop

Install Rust with the MSVC toolchain, Microsoft C++ Build Tools with Desktop development with C++, a Windows SDK, and WebView2. Follow the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

From the repository root in PowerShell:

```powershell
npm ci
$env:CARGO_BUILD_JOBS = '2'
$env:CARGO_TARGET_DIR = Join-Path (Get-Location) '.cache/native-target'
Set-Location apps/pendraw
npx tauri build --no-bundle --ci -- -j 2
```

The executable is `.cache/native-target/release/PenDraw.exe` relative to the repository root. The frontend and built-in sharing server are embedded in it. A fresh build needs internet access to download dependencies; do not use offline mode until those dependencies are cached. Node.js is needed for development and the optional Node relay. The complete Windows release hosts its own mirror; end users do not need Node.js.

### Make the self-contained portable package

Copy the built executable to a release folder as `PenDraw.exe`. From the repository root, run:

```powershell
./tools/package-webview.ps1 -Destination .cache/release/WebView2
```

This downloads the pinned official Microsoft WebView2 fixed runtime, verifies its checksum and executable signature, and copies all runtime files beside the app. The app selects that bundled runtime before creating its window. On Windows 10 it grants the read/execute permissions Microsoft requires on this bundled folder. No runtime installer or administrator permission is normally needed in a user-owned folder. Use a local drive, not a network share.

Include LICENSE, THIRD_PARTY_NOTICES.md and the entire licenses directory. Generate notices with `node tools/collect-notices.mjs` after dependencies are available. The Microsoft runtime is proprietary; preserve its terms, notices and first-run agreement screen when redistributing this package. Microsoft's redistribution terms are included in `licenses/Microsoft-WebView2/LICENSE.txt`.

Fixed runtimes do not automatically update. Update the pinned runtime URL, version, checksum and notices before publishing subsequent releases. See [Microsoft's distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution). The GitHub Windows workflow builds, verifies and packages the release from source.

### Optional developer-hosted relay

`npm start` runs the separate Node relay and serves the browser build on port 4000. This remains useful for development and browser-only hosting. The desktop's **Connect to a contributor mirror** setting accepts this relay's address. The Node relay has no access-key check; use it only on a trusted LAN. This is separate from the desktop's **Start sharing** feature, which provides a keyed browser link and a fresh session on each start. Do not run both hosts on port 4000 at the same time.

## Verification

From the repository root:

```sh
npm run check
npm run test:browser
```

The browser harness defaults to Windows Edge. Set `PENDRAW_BROWSER` to another installed Chromium executable if needed. It uses isolated browser storage and a temporary local server. Native operations are simulated in browser checks.

For native checks, first run `npm run build` to provide the assets embedded by the sharing server. Use the same absolute CARGO_TARGET_DIR as the build:

```powershell
Set-Location apps/pendraw/src-tauri
cargo test --release --locked -j 2 --lib -- --nocapture
```

Return to the repository root and run `npm run test:native-window` to check the compiled Windows app. It may show temporary test windows and opens a local debugging port. Test output stays under `.cache`. Physical pen, palm, side-button and real handwriting behavior still require device testing.

`PENDRAW_EXE` can select a packaged executable. With it set, `node apps/pendraw/tools/showcase-sharing.mjs` verifies the real built-in host and an actual browser mirror, using isolated profiles and synthetic demo content. It writes the public README screenshots to `docs/images` and a verification report under `.cache/showcase`. It starts sharing on port 4000 and may trigger a Private-network firewall prompt. It does not run a Node relay or read personal drawings.
