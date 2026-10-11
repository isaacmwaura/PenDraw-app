# PenDraw application

This workspace contains the React canvas application, LAN relay and Windows Tauri shell. See the [root README](../../README.md) for product behaviour, setup and verification.

The editor and editable mirror share Excalidraw. Desktop-only pen routing and handwriting recognition are enabled when the application runs in Tauri. Recognition is a two-step operation: analysis/preview, then guarded replacement with one undo step.

Use the repository root's `npm run check` and `npm run test:browser` for verification. The browser harness uses actual gestures and two live peers but simulates native operations. Rust tests separately exercise Windows Ink and disk operations. Native file pickers and hardware input remain device checks. Avoid replacing real-device review with its result.
