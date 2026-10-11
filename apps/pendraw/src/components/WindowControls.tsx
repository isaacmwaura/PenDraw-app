import {useAppearance} from '../appearance/context';
import {AppIcon,Icon} from './Icon';
export function Brand(){return <div className="pd-brand"><AppIcon/><strong>PenDraw</strong></div>}
export function WindowControls(){const a=useAppearance();return <div className="pd-window-controls"><button className="pd-title-button" aria-label={a.fullscreen?'Exit full screen':'Full screen'} title={a.fullscreen?'Exit full screen (F11)':'Full screen (F11)'} aria-pressed={a.fullscreen} onClick={a.toggleFullscreen}><Icon name="fullscreen"/></button></div>}
export function TitlebarSpace(){return <div className="pd-spacer"/>}
