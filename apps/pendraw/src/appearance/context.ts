import { createContext, useContext } from "react";
export type ThemeMode = "light" | "dark" | "system";
export type Appearance = {
    mode: ThemeMode;
    theme: 'light' | 'dark';
    setMode: (m: ThemeMode) => void;
    startFullscreen: boolean;
    setStartFullscreen: (b: boolean) => void;
    fullscreen: boolean;
    toggleFullscreen: () => void;
    desktop: boolean;
};
export const Context = createContext<Appearance | null>(null);
export function useAppearance() { const value = useContext(Context); if (!value)
    throw new Error('Appearance provider missing'); return value; }
