import {contentSignature} from '../board/content';
export function recoverySignature(elements:readonly any[],appState:any,files:Record<string,any>={}):string {
 const ids=[...new Set(elements.filter(e=>!e.isDeleted&&e.fileId).map(e=>e.fileId))].sort();
 return JSON.stringify([contentSignature(elements,files),appState?.viewBackgroundColor??'#ffffff',ids.map(id=>[id,files[id]?.dataURL??null,files[id]?.mimeType??null])]);
}
