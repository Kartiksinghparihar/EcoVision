
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useEco } from "@/lib/ecovision/store";
import { PageHeader, Panel, StateBadge, btnPrimary } from "@/components/eco/ui";
import { getUser } from "@/lib/ecovision/auth";
import { API_URL } from "@/lib/ecovision/config";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [
      { title: "Settings — EcoVision" },
      {
        name: "description",
        content: "Camera, notification and account settings.",
      },
    ],
  }),
  component: Settings,
});

const KEY = "ecovision.prefs";

const PREFS = [
  ["animal_detected", "Any animal detected"],
  ["priority_species", "High-priority species (tiger, leopard, dhole)"],
  ["camera_disconnected", "Camera disconnected"],
  ["sensor_malfunction", "Sensor malfunction"],
  ["mqtt_lost", "MQTT connection lost"],
  ["storage_warning", "Storage warning"],
  ["low_confidence", "Low-confidence classification"],
  ["unusual_frequency", "Unusual detection frequency"],
] as const;

function formatCoordinate(value: unknown): string {
  const number = Number(value);

  return value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(number)
    ? number.toFixed(4)
    : "—";
}

function Settings() {
  const { cameras = [], connected } = useEco();
  const user = getUser();

  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PREFS.map(([key]) => [key, key !== "animal_detected"])),
  );

  const [cam, setCam] = useState({
    resolution: "320x240",
    fps: 5,
    minConf: 60,
    cooldown: 30,
    liveStream: false,
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || "null");

      if (stored) {
        if (stored.prefs) setPrefs(stored.prefs);
        if (stored.cam) setCam((current) => ({ ...current, ...stored.cam }));
      }
    } catch {
      // Ignore invalid saved preferences.
    }
  }, []);

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ prefs, cam }));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Could not save EcoVision settings:", error);
      setSaved(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        actions={
          <button className={btnPrimary} onClick={save}>
            {saved ? "Saved ✓" : "Save changes"}
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Edge capture profile">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <label>
              Frame resolution
              <select
                value={cam.resolution}
                onChange={(e) =>
                  setCam({ ...cam, resolution: e.target.value })
                }
                className="mt-1 h-9 w-full rounded-md border border-input bg-secondary px-2"
              >
                {["160x120", "320x240", "640x480"].map((resolution) => (
                  <option key={resolution}>{resolution}</option>
                ))}
              </select>
            </label>

            <label>
              Frame rate (fps)
              <input
                type="number"
                min={1}
                max={15}
                value={cam.fps}
                onChange={(e) => setCam({ ...cam, fps: +e.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-secondary px-3"
              />
            </label>

            <label>
              Min confidence to publish (%)
              <input
                type="number"
                min={0}
                max={100}
                value={cam.minConf}
                onChange={(e) => setCam({ ...cam, minConf: +e.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-secondary px-3"
              />
            </label>

            <label>
              PIR cooldown (s)
              <input
                type="number"
                min={0}
                value={cam.cooldown}
                onChange={(e) => setCam({ ...cam, cooldown: +e.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-secondary px-3"
              />
            </label>

            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={cam.liveStream}
                onChange={(e) =>
                  setCam({ ...cam, liveStream: e.target.checked })
                }
              />
              Allow on-demand live CCTV stream (uses more power)
            </label>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            These settings are saved locally in this browser. They will not be
            pushed to devices until backend configuration publishing is
            implemented.
          </p>
        </Panel>

        <Panel title="Notification preferences">
          <ul className="space-y-2 text-sm">
            {PREFS.map(([key, label]) => (
              <li key={key}>
                <label className="flex items-center justify-between gap-3">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(prefs[key])}
                    onChange={(e) =>
                      setPrefs({ ...prefs, [key]: e.target.checked })
                    }
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                </label>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Camera traps">
          {cameras.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No cameras have been returned by the backend.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {cameras.map((camera, index) => (
                <li
                  key={camera.id ?? index}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <div>{camera.name || `Camera ${index + 1}`}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {camera.id ?? "Unknown ID"} ·{" "}
                      {formatCoordinate(camera.lat)},{" "}
                      {formatCoordinate(camera.lng)}
                    </div>
                  </div>
                  <StateBadge s={camera.state} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Account & connection">
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Signed in as</dt>
            <dd>{user?.email ?? "—"}</dd>

            <dt className="text-muted-foreground">Backend URL</dt>
            <dd className="break-all font-mono text-xs">
              {API_URL ?? "Not configured — set VITE_ECOVISION_API_URL"}
            </dd>

            <dt className="text-muted-foreground">Event stream</dt>
            <dd>
              <span
                className={
                  connected
                    ? "text-emerald-500"
                    : "text-destructive"
                }
              >
                {connected ? "Connected" : "Disconnected"}
              </span>
            </dd>

            <dt className="text-muted-foreground">Data source</dt>
            <dd>Backend API</dd>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
