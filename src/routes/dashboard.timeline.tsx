
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Save,
  Sun,
  X,
} from "lucide-react";
import { useEco } from "@/lib/ecovision/store";
import { SPECIES, SPECIES_MAP } from "@/lib/ecovision/species";
import { getSunTimes } from "@/lib/ecovision/sun";
import { addDays, dayDate, isValidDate, siteDay, siteHour } from "@/lib/ecovision/tz";
import { downloadCSV, fmtDateTime, pct } from "@/lib/ecovision/format";
import {
  PageHeader,
  Panel,
  SeverityBadge,
  btnCls,
  selectCls,
} from "@/components/eco/ui";
import type { Detection, SpeciesId } from "@/lib/ecovision/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/timeline")({
  head: () => ({
    meta: [
      { title: "Activity Timeline — EcoVision" },
      {
        name: "description",
        content: "Recorded wildlife activity with sunrise and sunset.",
      },
    ],
  }),
  component: Timeline,
});

const COL = 64;
const H = 576;
const TOP = 36;
const LEFT = 52;
const FILTER_KEY = "ecovision.timeline.filters";

interface Filters {
  species: SpeciesId[];
  camera: string;
  range: number;
}

const dayKey = (d: Date) => siteDay(d);

function Timeline() {
  const { detections, cameras, connected } = useEco();
  const [f, setF] = useState<Filters>({
    species: [],
    camera: "all",
    range: 14,
  });
  const [endOffset, setEndOffset] = useState(0);
  const [showSun, setShowSun] = useState(true);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    items: Detection[];
  } | null>(null);
  const [selected, setSelected] = useState<Detection[] | null>(null);
  const [saved, setSaved] = useState<(Filters & { name: string })[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem(FILTER_KEY) || "[]",
      ) as unknown;
      if (Array.isArray(value)) setSaved(value);
    } catch {
      // Ignore invalid saved presets.
    }
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ left: 99999 });
  }, [f.range, endOffset]);

  const ref =
    cameras.find((camera) => camera.id === f.camera) ?? cameras[0] ?? null;

  const days = useMemo(() => {
    const out: string[] = [];
    const end = addDays(siteDay(new Date()), -endOffset);

    for (let i = f.range - 1; i >= 0; i--) {
      out.push(addDays(end, -i));
    }

    return out;
  }, [f.range, endOffset]);

  const dayIndex = useMemo(
    () => Object.fromEntries(days.map((day, index) => [day, index])),
    [days],
  );

  const filtered = useMemo(
    () =>
      detections.filter((detection) => {
        // Ignore malformed timestamps before passing them to date/time helpers.
        if (!isValidDate(detection.timestamp)) return false;

        if (
          f.species.length &&
          !f.species.includes(detection.species)
        ) {
          return false;
        }

        if (
          f.camera !== "all" &&
          detection.deviceId !== f.camera
        ) {
          return false;
        }

        return dayKey(new Date(detection.timestamp)) in dayIndex;
      }),
    [detections, f, dayIndex],
  );

  const clusters = useMemo(() => {
    const grouped = new Map<string, Detection[]>();

    for (const detection of filtered) {
      const timestamp = new Date(detection.timestamp);
      const key = `${dayIndex[dayKey(timestamp)]}|${Math.floor(
        siteHour(timestamp),
      )}`;

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(detection);
    }

    return [...grouped.entries()].map(([key, items]) => {
      const dayIndexValue = Number(key.split("|")[0]);
      const avgHour =
        items.reduce(
          (sum, detection) =>
            sum + siteHour(new Date(detection.timestamp)),
          0,
        ) / items.length;

      return { di: dayIndexValue, h: avgHour, items };
    });
  }, [filtered, dayIndex]);

  const hourly = useMemo(() => {
    const counts = Array(24).fill(0) as number[];

    filtered.forEach((detection) => {
      const hour = Math.floor(siteHour(new Date(detection.timestamp)));
      if (hour >= 0 && hour < 24) counts[hour]++;
    });

    return counts;
  }, [filtered]);

  const maxHourly = Math.max(1, ...hourly);
  // Camera records may arrive without coordinates even though the TS type
  // declares them as numbers. Only calculate solar times for valid coordinates.
  const hasCoordinates =
    ref !== null &&
    Number.isFinite(ref.lat) &&
    Number.isFinite(ref.lng);

  const sun = useMemo(
    () =>
      hasCoordinates && ref
        ? days.map((day) => getSunTimes(day, ref.lat, ref.lng))
        : [],
    [days, ref, hasCoordinates],
  );

  const y = (hour: number) => TOP + (hour / 24) * H;
  const x = (index: number) => LEFT + index * COL + COL / 2;
  const W = LEFT + days.length * COL + 8;
  const now = new Date();
  const todayIdx = dayIndex[dayKey(now)];
  const nowH = siteHour(now);

  const toggleSpecies = (id: SpeciesId) =>
    setF((previous) => ({
      ...previous,
      species: previous.species.includes(id)
        ? previous.species.filter((species) => species !== id)
        : [...previous.species, id],
    }));

  const saveFilter = () => {
    const name = prompt("Name this filter preset")?.trim();
    if (!name) return;

    const next = [
      ...saved.filter((preset) => preset.name !== name),
      { ...f, name },
    ];

    setSaved(next);

    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {
      // Presets remain available for this session.
    }
  };

  const removePreset = (name: string) => {
    const next = saved.filter((preset) => preset.name !== name);
    setSaved(next);

    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {
      // Presets remain available for this session.
    }
  };

  return (
    <div>
      <PageHeader
        title="Animal Activity Timeline"
        subtitle={
          hasCoordinates && ref
            ? `Recorded detections by site-local time (IST). Sunrise and sunset are calculated for ${ref.name} (${ref.lat.toFixed(3)}, ${ref.lng.toFixed(3)}).`
            : "Recorded detections by site-local time (IST). Camera coordinates are needed to calculate sunrise and sunset."
        }
        actions={
          <button
            className={btnCls}
            onClick={() => downloadCSV(filtered)}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        }
      />

      {!connected && (
        <div className="mb-4 rounded-lg border border-border bg-secondary p-3 text-sm text-muted-foreground">
          Backend disconnected. Displayed data may be outdated until the
          connection is restored.
        </div>
      )}

      <Panel bodyClass="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-border">
            <button
              className="p-2 hover:bg-accent"
              onClick={() => setEndOffset((offset) => offset + f.range)}
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              className="border-x border-border px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => setEndOffset(0)}
            >
              Today
            </button>
            <button
              className="p-2 hover:bg-accent disabled:opacity-40"
              disabled={endOffset === 0}
              onClick={() =>
                setEndOffset((offset) => Math.max(0, offset - f.range))
              }
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <select
            className={selectCls}
            value={f.range}
            onChange={(event) =>
              setF({ ...f, range: Number(event.target.value) })
            }
            aria-label="Date range"
          >
            {[7, 14, 30].map((range) => (
              <option key={range} value={range}>
                {range} days
              </option>
            ))}
          </select>

          <select
            className={selectCls}
            value={f.camera}
            onChange={(event) =>
              setF({ ...f, camera: event.target.value })
            }
            aria-label="Camera"
          >
            <option value="all">All camera traps</option>
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name}
              </option>
            ))}
          </select>

          <button
            className={cn(
              btnCls,
              showSun && "border-sunrise text-sunrise",
            )}
            onClick={() => setShowSun((value) => !value)}
            aria-pressed={showSun}
          >
            <Sun className="h-4 w-4" />
            Sun curves
          </button>

          <button
            className={btnCls}
            disabled
            title="No predictive model is connected"
          >
            <span className="h-2 w-2 rounded-full border border-dashed border-muted-foreground" />
            Prediction layer unavailable
          </button>

          <button className={btnCls} onClick={saveFilter}>
            <Save className="h-4 w-4" />
            Save filter
          </button>

          {saved.map((preset) => (
            <span
              key={preset.name}
              className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs"
            >
              <button
                onClick={() =>
                  setF({
                    species: preset.species,
                    camera: preset.camera,
                    range: preset.range,
                  })
                }
              >
                {preset.name}
              </button>
              <button
                onClick={() => removePreset(preset.name)}
                aria-label={`Remove ${preset.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SPECIES.map((species) => {
            const active = f.species.includes(species.id);

            return (
              <button
                key={species.id}
                onClick={() => toggleSpecies(species.id)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
                  active
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-base">{species.icon}</span>
                {species.name}
              </button>
            );
          })}

          {f.species.length > 0 && (
            <button
              onClick={() => setF({ ...f, species: [] })}
              className="px-2 text-xs text-muted-foreground underline"
            >
              Clear
            </button>
          )}
        </div>

        {cameras.length === 0 && (
          <div className="rounded-lg border border-border p-6 text-center">
            <h2 className="font-display text-lg">
              No camera locations available
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Register cameras with the backend to enable location-specific
              sunrise and sunset calculations.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <div
            ref={scroller}
            className="relative min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-background"
          >
            <svg
              width={W}
              height={TOP + H + 12}
              className="block"
            >
              {days.map((day, index) => (
                <g key={day}>
                  <rect
                    x={LEFT + index * COL}
                    y={TOP}
                    width={COL}
                    height={H}
                    fill="var(--card)"
                  />

                  {sun[index] && (
                    <>
                      <rect
                        x={LEFT + index * COL}
                        y={y(0)}
                        width={COL}
                        height={y(sun[index]!.sunrise) - y(0)}
                        fill="var(--night)"
                      />
                      <rect
                        x={LEFT + index * COL}
                        y={y(sun[index]!.sunset)}
                        width={COL}
                        height={y(24) - y(sun[index]!.sunset)}
                        fill="var(--night)"
                      />
                    </>
                  )}

                  <line
                    x1={LEFT + index * COL}
                    x2={LEFT + index * COL}
                    y1={TOP}
                    y2={TOP + H}
                    stroke="var(--border)"
                  />

                  <text
                    x={x(index)}
                    y={14}
                    textAnchor="middle"
                    className="fill-muted-foreground font-mono"
                    fontSize={10}
                  >
                    {dayDate(day).toLocaleDateString([], {
                      weekday: "short",
                      timeZone: "UTC",
                    })}
                  </text>

                  <text
                    x={x(index)}
                    y={27}
                    textAnchor="middle"
                    className={
                      index === todayIdx
                        ? "fill-neon font-mono"
                        : "fill-foreground font-mono"
                    }
                    fontSize={11}
                  >
                    {dayDate(day).getUTCDate()}{" "}
                    {dayDate(day).toLocaleDateString([], {
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </text>
                </g>
              ))}

              {Array.from({ length: 25 }, (_, hour) => (
                <g key={hour}>
                  <line
                    x1={LEFT}
                    x2={W}
                    y1={y(hour)}
                    y2={y(hour)}
                    stroke="var(--border)"
                    strokeOpacity={hour % 6 === 0 ? 0.9 : 0.3}
                  />

                  {hour % 2 === 0 && (
                    <text
                      x={LEFT - 8}
                      y={y(hour) + 3}
                      textAnchor="end"
                      className="fill-muted-foreground font-mono"
                      fontSize={10}
                    >
                      {String(hour).padStart(2, "0")}:00
                    </text>
                  )}
                </g>
              ))}

              {showSun && sun.length > 0 && (
                <>
                  <polyline
                    fill="none"
                    stroke="var(--sunrise)"
                    strokeWidth={2}
                    points={sun
                      .map((value, index) =>
                        `${x(index)},${y(value.sunrise)}`,
                      )
                      .join(" ")}
                  />
                  <polyline
                    fill="none"
                    stroke="var(--sunset)"
                    strokeWidth={2}
                    points={sun
                      .map((value, index) =>
                        `${x(index)},${y(value.sunset)}`,
                      )
                      .join(" ")}
                  />
                </>
              )}

              {todayIdx !== undefined && (
                <g>
                  <line
                    x1={LEFT + todayIdx * COL + COL / 2}
                    x2={LEFT + todayIdx * COL + COL / 2}
                    y1={TOP}
                    y2={TOP + H}
                    stroke="var(--neon)"
                    strokeOpacity={0.35}
                    strokeDasharray="3 3"
                  />
                  <line
                    x1={LEFT + todayIdx * COL}
                    x2={LEFT + todayIdx * COL + COL}
                    y1={y(nowH)}
                    y2={y(nowH)}
                    stroke="var(--neon)"
                    strokeWidth={2}
                  />
                  <circle
                    cx={LEFT + todayIdx * COL + COL}
                    cy={y(nowH)}
                    r={3}
                    fill="var(--neon)"
                  />
                </g>
              )}

              {clusters.map((cluster, index) => {
                const cx = x(cluster.di);
                const cy = y(cluster.h);
                const single = cluster.items.length === 1;
                const priority = cluster.items.some(
                  (detection) => SPECIES_MAP[detection.species]?.priority,
                );

                return (
                  <g
                    key={`${cluster.di}-${cluster.h}-${index}`}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`${cluster.items.length} detections`}
                    onClick={() => setSelected(cluster.items)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(cluster.items);
                      }
                    }}
                    onMouseEnter={(event) => {
                      const bounds =
                        scroller.current?.getBoundingClientRect();
                      if (!bounds || !scroller.current) return;

                      setHover({
                        x:
                          event.clientX -
                          bounds.left +
                          scroller.current.scrollLeft,
                        y: cy,
                        items: cluster.items,
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                  >
                    {single ? (
                      <>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={12}
                          fill="var(--secondary)"
                          stroke={
                            priority
                              ? "var(--sunrise)"
                              : "var(--border)"
                          }
                        />
                        <text
                          x={cx}
                          y={cy + 5}
                          textAnchor="middle"
                          fontSize={14}
                        >
                          {SPECIES_MAP[cluster.items[0]!.species]?.icon ?? "•"}
                        </text>
                      </>
                    ) : (
                      <>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={13}
                          fill={
                            priority
                              ? "var(--sunrise)"
                              : "var(--primary)"
                          }
                          fillOpacity={0.9}
                        />
                        <text
                          x={cx}
                          y={cy + 4}
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight={700}
                          className="fill-primary-foreground font-mono"
                        >
                          {cluster.items.length}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {hover && (
              <div
                className="glass pointer-events-none absolute z-10 w-56 rounded-md p-2 text-xs"
                style={{
                  left: hover.x + 16,
                  top: hover.y - 10,
                }}
              >
                {hover.items.slice(0, 5).map((detection) => (
                  <div
                    key={detection.id}
                    className="flex items-center justify-between gap-2 py-0.5"
                  >
                    <span>
                      {SPECIES_MAP[detection.species]?.icon ?? "•"}{" "}
                      {SPECIES_MAP[detection.species]?.name ??
                        detection.species}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {new Date(detection.timestamp).toLocaleTimeString(
                        [],
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                  </div>
                ))}
                {hover.items.length > 5 && (
                  <div className="text-muted-foreground">
                    +{hover.items.length - 5} more · click to view
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="hidden w-28 shrink-0 rounded-lg border border-border bg-background md:block">
            <div className="px-2 text-center font-mono text-[10px] leading-[36px] text-muted-foreground">
              per hour
            </div>
            <svg
              width="100%"
              height={H}
              viewBox={`0 0 100 ${H}`}
              preserveAspectRatio="none"
            >
              {hourly.map((value, hour) => (
                <rect
                  key={hour}
                  x={0}
                  y={(hour / 24) * H + 2}
                  height={H / 24 - 4}
                  width={(value / maxHourly) * 96}
                  fill="var(--primary)"
                  fillOpacity={0.35 + 0.65 * (value / maxHourly)}
                  rx={2}
                />
              ))}
            </svg>
          </div>
        </div>

        <div className="flex flex-wrap gap-5 text-xs text-muted-foreground">
          <Legend c="bg-sunrise" l="Sunrise" />
          <Legend c="bg-sunset" l="Sunset" />
          <Legend c="bg-night border border-border" l="Night" />
          <Legend c="bg-neon" l="Now" />
          <Legend c="bg-primary rounded-full" l="Detection cluster" />
          <span>{filtered.length} recorded detections</span>
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No detections match the selected date range and filters.
          </p>
        )}
      </Panel>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="panel max-h-[80vh] w-full max-w-lg overflow-y-auto p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-xl">
                {selected.length} detection{selected.length !== 1 && "s"}
              </h3>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="space-y-2">
              {selected.map((detection) => (
                <li
                  key={detection.id}
                  className="rounded-lg border border-border p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {SPECIES_MAP[detection.species]?.icon ?? "•"}{" "}
                      {SPECIES_MAP[detection.species]?.name ??
                        detection.species}
                    </span>
                    <SeverityBadge s={detection.severity} />
                  </div>

                  <div className="mt-1 grid grid-cols-2 gap-1 font-mono text-xs text-muted-foreground">
                    <span>{fmtDateTime(detection.timestamp)}</span>
                    <span>{detection.deviceId}</span>
                    <span>Confidence {pct(detection.confidence)}</span>
                    <span>
                      {detection.temperature ?? "—"}°C ·{" "}
                      {detection.humidity ?? "—"}% RH
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", c)} />
      {l}
    </span>
  );
}
