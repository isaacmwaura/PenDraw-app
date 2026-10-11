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

The executable is `.cache/native-target/release/PenDraw.exe` relative to the repository root. The frontend is embedded in it. A fresh build needs internet access to download dependencies; do not use offline mode until those dependencies are cached. Node.js is needed for building and hosting the mirror, not for opening the desktop executable.

## Verification

From the repository root:

```sh
npm run check
npm run test:browser
```

The browser harness defaults to Windows Edge. Set `PENDRAW_BROWSER` to another installed Chromium executable if needed. It uses isolated browser storage and a temporary local server. Native operations are simulated in browser checks.

For native checks, use the same absolute CARGO_TARGET_DIR as the build:

```powershell
Set-Location apps/pendraw/src-tauri
cargo test --release -j 2 --lib -- --nocapture
```

Return to the repository root and run `npm run test:native-window` to check the compiled Windows app. It may show temporary test windows and opens a local debugging port. Test output stays under `.cache`. Physical pen, palm, side-button and real handwriting behavior still require device testing.
