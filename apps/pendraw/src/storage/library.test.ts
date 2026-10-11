import { afterEach, expect, it, vi } from 'vitest';
import { loadLibrary, saveLibrary } from './library';
afterEach(() => vi.unstubAllGlobals());
it('keeps a usable library when the saved cache contains unrelated or malformed entries', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify([null, { id: 'missing-elements' }, { id: 'valid', status: 'unpublished', elements: [] }]) });
    expect(loadLibrary()).toEqual([{ id: 'valid', status: 'unpublished', elements: [] }]);
});
it('survives corrupt or inaccessible local library storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{broken' });
    expect(loadLibrary()).toEqual([]);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Denied'); } });
    expect(loadLibrary()).toEqual([]);
});
it('reports failed library persistence and leaves the previous saved copy intact', () => {
    const previous = '[{"id":"previous"}]', alert = vi.fn();
    let stored = previous;
    vi.stubGlobal('window', { alert });
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('Quota exceeded'); }, getItem: () => stored });
    saveLibrary([]);
    expect(stored).toBe(previous);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('export'));
});
