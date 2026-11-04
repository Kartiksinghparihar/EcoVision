import type { CameraState, Detection, Severity } from "./types";
import { SPECIES_MAP } from "./species";

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export function ago(iso: string | number) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const SEVERITY_CLASS: Record<Severity, string> = {
  info: "bg-secondary text-secondary-foreground",
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-sunrise/15 text-sunrise",
  critical: "bg-destructive/20 text-destructive",
};

export const STATE_META: Record<CameraState, { label: string; dot: string; text: string }> = {
  offline: { label: "Offline", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  idle: { label: "Idle", dot: "bg-warning", text: "text-warning" },
  recording: { label: "Recording", dot: "bg-live pulse-dot", text: "text-live" },
  live: { label: "Live", dot: "bg-neon pulse-dot", text: "text-neon" },
};

export function toCSV(rows: Detection[]) {
  const head = "id,species,scientific,confidence,timestamp,device_id,temperature_c,humidity_pct,status,severity";
  const body = rows.map((d) =>
    [d.id, d.species, SPECIES_MAP[d.species].scientific, d.confidence, d.timestamp, d.deviceId, d.temperature, d.humidity, d.status, d.severity].join(","),
  );
  return [head, ...body].join("\n");
}
export function downloadCSV(rows: Detection[], name = "ecovision-detections.csv") {
  const blob = new Blob([toCSV(rows)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
