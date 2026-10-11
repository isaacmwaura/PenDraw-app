import { useEffect, type RefObject } from "react";
import { useDialogFocus } from "./useDialogFocus";
export function usePopover(open: boolean, wrapper: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>, close: () => void) {
    useDialogFocus(open, panel, close);
    useEffect(() => { if (!open)
        return; const down = (e: PointerEvent) => { if (!wrapper.current?.contains(e.target as Node))
        close(); }; window.addEventListener('pointerdown', down); return () => window.removeEventListener('pointerdown', down); }, [open, wrapper, close]);
}
