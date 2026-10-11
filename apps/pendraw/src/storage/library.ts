import type { LibraryItems } from "@excalidraw/excalidraw/types";
const KEY = 'pendraw:library';
export function loadLibrary(): LibraryItems { try {
    const items = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(items) ? items.filter(i => i && typeof i.id === 'string' && Array.isArray(i.elements) && (i.status === 'published' || i.status === 'unpublished')) : [];
}
catch {
    return [];
} }
export function saveLibrary(items: LibraryItems): void { try {
    localStorage.setItem(KEY, JSON.stringify(items));
}
catch {
    window.alert('Library could not be saved on this device. Use the Library export button to keep a copy.');
} }
