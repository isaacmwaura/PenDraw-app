// Hides Excalidraw's built-in three-preset "Stroke width" control, since PenDraw
// replaces it with a single continuous Thickness slider. The control is a
// <fieldset> whose <legend> reads "Stroke width"; the panel mounts/unmounts as
// tools change, so we keep hiding it via a MutationObserver.
let installed = false;

export function installHideNativeStrokeWidth() {
  if (installed) return;
  installed = true;

  const hide = () => {
    document.querySelectorAll("legend").forEach((lg) => {
      if ((lg.textContent || "").trim().toLowerCase() === "stroke width") {
        const fs = lg.closest("fieldset") as HTMLElement | null;
        if (fs) fs.style.display = "none";
      }
    });
  };

  hide();
  const obs = new MutationObserver(() => hide());
  obs.observe(document.body, { childList: true, subtree: true });
}
