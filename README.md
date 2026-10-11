# PenDraw

A pen-first whiteboard for Windows, with a browser version and a live, editable mirror on another computer.

PenDraw is based on the [Excalidraw drawing engine](https://github.com/excalidraw/excalidraw), which is MIT licensed. PenDraw adds a Windows desktop shell, pen and touch controls, Windows handwriting recognition, and local-network mirroring. It is an independent project, not an official Excalidraw release.

Draw with three saved pens and a highlighter. Add shapes, text boxes and images. Select and move objects, fill clear closed outlines, and export selections as PNG images. The compact Draw / Insert / View ribbon collapses when you need more drawing space.

## Download and open

[Download PenDraw v0.2.3 for Windows](https://github.com/isaacmwaura/PenDraw-app/releases/download/v0.2.3/PenDraw-0.2.3.exe) · [Release notes and checksum](https://github.com/isaacmwaura/PenDraw-app/releases/tag/v0.2.3)

Version 0.2.3 is a portable Windows executable: download it to a folder and open it. No installer is required. The desktop app uses Microsoft WebView2; install the [Evergreen WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) if it is missing.

This release is not digitally signed. Windows may show an unrecognized-app warning because the download has not established a trusted reputation. Download only from this project's official release page and compare the SHA-256 checksum supplied with the release. A matching checksum confirms file identity, not that software is harmless. If you trust the download and SmartScreen offers **More info → Run anyway**, that allows this particular app to open. Do not disable Windows security. Smart App Control or an organization's policy may block it without that option; contact your administrator rather than bypassing policy. See [Microsoft's explanation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## Use your board

- **Draw:** choose a saved pen, highlighter, shape, selection, lasso or eraser. On a pen-and-touch device, Pen mode routes the pen to drawing and fingers to navigation.
- **Insert:** drag a text box, add an image or fill a clear closed outline. Resizing a text box wraps its words without changing font size.
- **View:** select guides, fit the board, return to 100% zoom, or enable held-line straightening. F11 gives the canvas more room.
- **Menu:** open/save `.excalidraw` drawings, manage the Library, export PNG, or change appearance and sharing settings.
- **Ink to text (Windows desktop):** select handwriting, inspect the recognition preview, and keep any unwanted blocks as ink before converting. Accuracy depends on handwriting and installed Windows recognition support.

Local recovery and named files are separate. Recovery keeps a local copy of your board; use **Save** to update a named drawing file. Recovery, Library and preferences belong to this device and do not transfer automatically.

## Mirror a board to another computer

Both computers must be on the same trusted local network. On the host computer, install [Node.js](https://nodejs.org/) with npm, download the source, and run:

```sh
npm ci
npm start
```

Keep the server window open. It prints the drawing address for the other computer and the mirror address for this computer. Open those addresses in the two browsers. Both views can edit the board. **Lock to presenter** follows the editor's view; **Free look** lets the mirror navigate independently.

To connect the Windows desktop app, open **Menu → Settings**, enable **Connect to a contributor mirror**, and enter the host's address, such as `192.168.1.50:4000`.

The first server launch may show a Windows firewall prompt. Allow Node.js on **Private networks** only when you intend to share on a trusted network. The relay has no sign-in or encrypted transport by default. Anyone able to reach it can join and edit the shared board. Do not expose it to the public internet. Stop sharing by closing the server and disabling the desktop connection. Save your board before replacing it with New/Open.

## Build from source

See [BUILDING.md](BUILDING.md) for browser and Windows builds, prerequisites and verification.

## License

PenDraw is licensed under the [MIT License](LICENSE). You may use, modify, redistribute and sell copies, provided the required copyright and license notices are retained. Third-party components retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/` for bundled attribution and license texts.
