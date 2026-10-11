import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// StrictMode intentionally omitted: it double-mounts effects in dev, which would
// open the WebSocket connection twice. A single connection keeps the mirror simple.
createRoot(document.getElementById("root")!).render(<App />);
