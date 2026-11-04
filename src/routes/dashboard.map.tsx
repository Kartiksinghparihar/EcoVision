
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { useEco } from "@/lib/ecovision/store";
import { SPECIES } from "@/lib/ecovision/species";
import {
  PageHeader,
  Panel,
  SpeciesIcon,
  StateBadge,
  btnCls,
} from "@/components/eco/ui";
import { ago, fmtDateTime, pct } from "@/lib/ecovision/format";
import type { SpeciesId } from "@/lib/ecovision/types";
import { cn } from "@/lib/utils";

const TrapMap = lazy(() => import("@/components/eco/TrapMap"));

export const Route = createFileRoute("/dashboard/map")({
  head: () => ({
    meta: [
      { title: "Trap Map — EcoVision" },
      {
        name: "description",
        content: "Camera trap locations and recorded sightings.",
      },
    ],
  }),
  component: MapPage,
});

function formatCoordinate(value: unknown): string {
  const number = Number(value);

  return value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(number)
    ? number.toFixed(4)
    : "Unavailable";
}

function MapPage() {
  const { cameras = [], detections = [], connected } = useEco();
  const [species, setSpecies] = useState<SpeciesId[]>([]);
  const [heat, setHeat] = useState(true);
  const [sel, setSel] = useState<string | null>(null);

  const safeCameras = Array.isArray(cameras) ? cameras : [];
  const safeDetections = Array.isArray(detections) ? detections : [];

  const selectedId =
    sel && safeCameras.some((camera) => camera.id === sel)
      ? sel
      : (safeCameras[0]?.id ?? null);

  const filtered = useMemo(
    () =>
      safeDetections.filter(
        (d) => !species.length || species.includes(d.species),
      ),
    [safeDetections, species],
  );

  const cam = safeCameras.find((camera) => camera.id === selectedId);
  const camDet = filtered.filter((d) => d.deviceId === selectedId);

  return (
    <div>
      <PageHeader
        title="Camera Trap Map"
        subtitle="Markers show recorded sightings at fixed trap locations. Activity zones are estimates and do not represent confirmed animal territories or routes."
        actions={
          <button
            className={cn(btnCls, heat && "border-primary text-primary")}
            onClick={() => setHeat((value) => !value)}
            aria-pressed={heat}
          >
            Activity zones
          </button>
        }
      />

      {!connected && (
        <div className="mb-4 rounded-lg border border-border bg-secondary p-3 text-sm text-muted-foreground">
          Backend disconnected. Map data may be outdated until the connection
          is restored.
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        {SPECIES.map((s) => (
          <button
            key={s.id}
            onClick={() =>
              setSpecies((previous) =>
                previous.includes(s.id)
                  ? previous.filter((id) => id !== s.id)
                  : [...previous, s.id],
              )
            }
            aria-pressed={species.includes(s.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              species.includes(s.id)
                ? "border-primary bg-primary/15"
                : "border-border text-muted-foreground",
            )}
          >
            {s.icon} {s.name}
          </button>
        ))}
      </div>

      {safeCameras.length === 0 && (
        <div className="panel p-6 text-center">
          <h2 className="font-display text-lg">No camera locations available</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Camera locations will appear here when the backend provides
            registered cameras with their coordinates.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {safeCameras.length > 0 && (
          <div className="panel h-[620px] overflow-hidden">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading map…
                </div>
              }
            >
              <TrapMap
                cameras={safeCameras}
                detections={filtered}
                showHeat={heat}
                onSelect={setSel}
                selected={selectedId}
              />
            </Suspense>
          </div>
        )}

        {cam && (
          <Panel
            title={cam.name || "Camera"}
            action={<StateBadge s={cam.state} />}
            bodyClass="space-y-4 text-sm"
          >
            <div className="grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground">
              <span>{cam.id ?? "Unknown ID"}</span>
              <span>fw {cam.firmware ?? "—"}</span>
              <span>
                {formatCoordinate(cam.lat)}, {formatCoordinate(cam.lng)}
              </span>
              <span>Seen {cam.lastSeen ? ago(cam.lastSeen) : "—"}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-secondary p-2">
                <div className="font-display text-xl">{camDet.length}</div>
                <div className="text-[10px] text-muted-foreground">
                  sightings
                </div>
              </div>

              <div className="rounded-lg bg-secondary p-2">
                <div className="font-display text-xl">
                  {new Set(camDet.map((d) => d.species)).size}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  species
                </div>
              </div>

              <div className="rounded-lg bg-secondary p-2">
                <div className="font-display text-xl">
                  {Number.isFinite(Number(cam.battery))
                    ? `${cam.battery}%`
                    : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  battery
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Sighting history
              </h3>

              {camDet.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recorded sightings for this camera and filter.
                </p>
              ) : (
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                  {camDet.slice(0, 40).map((d, index) => (
                    <li
                      key={d.id ?? index}
                      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-secondary"
                    >
                      <SpeciesIcon id={d.species} className="text-lg" />
                      <span className="flex-1 truncate">
                        {d.timestamp ? fmtDateTime(d.timestamp) : "Unknown time"}
                      </span>
                      <span className="font-mono text-xs text-primary">
                        {Number.isFinite(Number(d.confidence))
                          ? pct(d.confidence)
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
