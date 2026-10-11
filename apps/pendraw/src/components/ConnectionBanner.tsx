import type { ConnStatus } from "../sync/connection";

type Props = {
  status: ConnStatus;
  /** Whether we were ever connected — avoids a banner flash on first load. */
  everConnected: boolean;
  onReconnect: () => void;
  /** Optional: show a "Download backup" button (editor only). */
  onBackup?: () => void;
};

// A prominent popup shown when the connection drops. It reassures the user their
// work is saved locally, and offers a backup download and a manual reconnect.
export default function ConnectionBanner({ status, everConnected, onReconnect, onBackup }: Props) {
  const show = status === "disconnected" || (everConnected && status === "connecting");
  if (!show) return null;

  const disconnected = status === "disconnected";

  return (
    <div className={"pd-banner " + (disconnected ? "err" : "warn")} role="alert">
      <span className="pd-banner-icon">{disconnected ? "⚠" : "⟳"}</span>
      <div className="pd-banner-text">
        <strong>{disconnected ? "Disconnected from the network" : "Reconnecting…"}</strong>
        <span>
          {disconnected
            ? "Your work is safely saved in this browser. Trying to reconnect automatically…"
            : "Re-establishing the connection…"}
        </span>
      </div>
      {onBackup && (
        <button className="pd-btn ghost" onClick={onBackup}>
          Download backup
        </button>
      )}
      {disconnected && (
        <button className="pd-btn" onClick={onReconnect}>
          Reconnect now
        </button>
      )}
    </div>
  );
}
