import { useEffect, useMemo } from "react";
import {AppearanceProvider} from "./appearance/Appearance";
import Editor from "./modes/Editor";
import Mirror from "./modes/Mirror";
import { installDesktopBehaviors } from "./desktop/setup";
import RuntimeTerms from './legal/RuntimeTerms';

// Mode is chosen by the URL:
//   http://<host>:<port>/          -> Editor (the presenter draws here)
//   http://<host>:<port>/?mirror   -> Mirror (read-only, on the desktop)
export default function App() {
  const isMirror = useMemo(
    () => new URLSearchParams(window.location.search).has("mirror"),
    [],
  );
  useEffect(() => installDesktopBehaviors(), []);
  return <AppearanceProvider><RuntimeTerms>{isMirror ? <Mirror /> : <Editor />}</RuntimeTerms></AppearanceProvider>;
}
