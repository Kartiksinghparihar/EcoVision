
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Battery, Clapperboard, Radio, Signal } from "lucide-react";

import { useEco } from "@/lib/ecovision/store";
import { CameraFeed } from "@/components/eco/CameraFeed";

import {
  Panel,
  SeverityBadge,
  SpeciesIcon,
  StateBadge,
  selectCls,
} from "@/components/eco/ui";

import { SPECIES_MAP } from "@/lib/ecovision/species";
import { ago, fmtDateTime, pct } from "@/lib/ecovision/format";
import type { Detection } from "@/lib/ecovision/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Live Monitor — EcoVision" },
      {
        name: "description",
        content: "Live camera trap feed and incoming detections.",
      },
    ],
  }),
  component: LiveMonitor,
});

function normalizeSpecies(value: string) {
  return value.toLowerCase().trim().replace(/[_-]+/g, " ");
}

function isValidDetection(detection: Detection) {
  const speciesId = normalizeSpecies(detection.species);

  return Object.keys(SPECIES_MAP).some(
    (id) => normalizeSpecies(id) === speciesId,
  );
}

function LiveMonitor() {
  const {
    cameras,
    detections,
    connected,
  } = useEco();

  const [camId, setCamId] = useState("");
  const [playback, setPlayback] = useState<Detection | null>(null);

  const validDetections = useMemo(
    () => detections.filter(isValidDetection),
    [detections],
  );

  useEffect(() => {
    if (
      cameras.length > 0 &&
      !cameras.some((camera) => camera.id === camId)
    ) {
      setCamId(cameras[0].id);
    }
  }, [cameras, camId]);

  useEffect(() => {
    if (playback && !validDetections.some((d) => d.id === playback.id)) {
      setPlayback(null);
    }
  }, [playback, validDetections]);

  const camera = cameras.find((item) => item.id === camId);

  // Match detections using both camera ID and device ID.
  const camDetections = useMemo(() => {
    if (!camera) return [];

    return validDetections
      .filter(
        (detection) =>
          detection.deviceId === camera.deviceId ||
          detection.deviceId === camera.id,
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() -
          new Date(a.timestamp).getTime(),
      );
  }, [validDetections, camera]);

  const feed = validDetections.slice(0, 30);

  if (!camera) {
    return (
      <div className="space-y-4">
        <Panel title="Live Monitor">
          <div className="py-12 text-center">
            <Signal className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h2 className="font-semibold">No cameras available</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {connected
                ? "Backend connected, but no camera was returned."
                : "Waiting for backend connection and camera data."}
            </p>
          </div>
        </Panel>

        <Panel title="Live detections">
          <p className="py-6 text-center text-sm text-muted-foreground">
            {feed.length === 0
              ? "No valid wildlife detections received yet."
              : `${feed.length} detections loaded, but no camera is available.`}
          </p>
        </Panel>
      </div>
    );
  }

  const selectedDetection =
    playback ??
    camDetections.find((detection) => Boolean(detection.thumbnail)) ??
    camDetections[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        <Panel
          title={
            <span className="flex items-center gap-3">
              Camera feed <StateBadge s={camera.state} />
            </span>
          }
          action={
            <select
              value={camId}
              onChange={(e) => {
                setCamId(e.target.value);
                setPlayback(null);
              }}
              className={selectCls}
              aria-label="Select camera"
            >
              {cameras.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          }
          bodyClass="p-3"
        >
          <CameraFeed
            camera={camera}
            latest={selectedDetection}
            playback={playback}
            onExitPlayback={() => setPlayback(null)}
            demo={false}
          />

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            <Health
              icon={<Signal className="h-3.5 w-3.5" />}
              label="Connection"
              value={
                camera.state === "offline"
                  ? "Lost"
                  : camera.state === "live"
                    ? "Online"
                    : "Connected"
              }
              bad={camera.state === "offline"}
            />

            <Health
              icon={<Battery className="h-3.5 w-3.5" />}
              label="Battery"
              value={
                camera.battery == null
                  ? "Not available"
                  : `${camera.battery}%`
              }
              bad={
                camera.battery != null &&
                camera.battery < 20
              }
            />

            <Health
              icon={<Radio className="h-3.5 w-3.5" />}
              label="Last heartbeat"
              value={camera.lastSeen ? ago(camera.lastSeen) : "Not available"}
              bad={!camera.lastSeen}
            />

            <Health
              icon={<Radio className="h-3.5 w-3.5" />}
              label="Last motion"
              value={
                camDetections[0]
                  ? ago(camDetections[0].timestamp)
                  : "—"
              }
            />
          </div>
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-primary" />
              Recent recordings · {camera.name}
            </span>
          }
        >
          <div className="flex gap-3 overflow-x-auto pb-1">
            {camDetections.slice(0, 12).map((detection) => {
              const species = SPECIES_MAP[detection.species];

              return (
                <button
                  key={detection.id}
                  onClick={() => setPlayback(detection)}
                  className={cn(
                    "w-40 shrink-0 rounded-lg border border-border bg-secondary p-3 text-left transition hover:border-primary",
                    playback?.id === detection.id && "border-neon",
                  )}
                >
                  {detection.thumbnail ? (
                    <img
                      src={detection.thumbnail}
                      alt={species.name}
                      className="mb-2 h-20 w-full rounded-md object-cover"
                    />
                  ) : (
                    <SpeciesIcon
                      id={detection.species}
                      className="text-2xl"
                    />
                  )}

                  <div className="mt-2 truncate text-sm font-medium">
                    {species.name}
                  </div>

                  <div className="font-mono text-[10px] text-muted-foreground">
                    {fmtDateTime(detection.timestamp)}
                  </div>

                  <div className="font-mono text-[10px] text-muted-foreground">
                    {pct(detection.confidence)} confidence
                  </div>
                </button>
              );
            })}

            {camDetections.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No detections associated with this camera yet.
              </p>
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected ? "bg-neon pulse-dot" : "bg-destructive",
              )}
            />
            Live detections
          </span>
        }
        action={
          <span className="font-mono text-[10px] text-muted-foreground">
            {connected ? "CONNECTED" : "DISCONNECTED"}
          </span>
        }
        bodyClass="p-0"
      >
        <ul className="max-h-[calc(100vh-180px)] divide-y divide-border overflow-y-auto">
          {feed.map((detection) => {
            const species = SPECIES_MAP[detection.species];

            return (
              <li
                key={detection.id}
                className={cn(
                  "rise flex gap-3 px-4 py-3",
                  species.priority && "bg-sunrise/5",
                )}
              >
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-2xl",
                    species.priority && "ring-1 ring-sunrise",
                  )}
                >
                  {detection.thumbnail ? (
                    <img
                      src={detection.thumbnail}
                      alt={species.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    species.icon
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {species.name}
                    </span>
                    <SeverityBadge s={detection.severity} />
                  </div>

                  <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground">
                    <span
                      className={
                        detection.confidence < 0.6
                          ? "text-warning"
                          : "text-primary"
                      }
                    >
                      {pct(detection.confidence)}
                    </span>

                    <span>{detection.deviceId}</span>

                    <span>
                      {detection.temperature ?? "—"}°C ·{" "}
                      {detection.humidity ?? "—"}%
                    </span>
                  </div>

                  <div className="mt-0.5 flex justify-between text-[11px] text-muted-foreground">
                    <span>{fmtDateTime(detection.timestamp)}</span>
                    <span className="capitalize">
                      {detection.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}

          {feed.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              No wildlife detections received yet.
            </li>
          )}
        </ul>
      </Panel>
    </div>
  );
}

function Health({
  icon,
  label,
  value,
  bad,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </div>

      <div
        className={cn(
          "mt-0.5 font-mono text-sm",
          bad ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
