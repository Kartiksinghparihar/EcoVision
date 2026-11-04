
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useEco } from "@/lib/ecovision/store";
import { SPECIES, SPECIES_MAP } from "@/lib/ecovision/species";
import { isNight } from "@/lib/ecovision/sun";
import { PageHeader, Panel, Stat, selectCls } from "@/components/eco/ui";
import type { SpeciesId } from "@/lib/ecovision/types";

export const Route = createFileRoute("/dashboard/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — EcoVision" },
      {
        name: "description",
        content: "Species, activity and camera performance analytics.",
      },
    ],
  }),
  component: Analytics,
});

const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--foreground)" },
};

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

function Analytics() {
  const { detections, cameras, connected } = useEco();
  const [range, setRange] = useState(30);
  const [camera, setCamera] = useState("all");
  const [species, setSpecies] = useState<SpeciesId | "all">("all");

  const data = useMemo(() => {
    const since = Date.now() - range * 86400000;

    return detections.filter(
      (d) =>
        new Date(d.timestamp).getTime() >= since &&
        (camera === "all" || d.deviceId === camera) &&
        (species === "all" || d.species === species),
    );
  }, [detections, range, camera, species]);

  const camById = Object.fromEntries(cameras.map((c) => [c.id, c]));

  const stats = useMemo(() => {
    const bySp = SPECIES.map((s) => ({
      name: s.name,
      id: s.id,
      icon: s.icon,
      color: s.color,
      count: data.filter((d) => d.species === s.id).length,
    })).filter((s) => s.count);

    const top = [...bySp].sort((a, b) => b.count - a.count)[0];

    const hourly = Array.from({ length: 24 }, (_, h) => ({
      h: String(h).padStart(2, "0"),
      count: 0,
    }));

    const daily = new Map<string, number>();
    let night = 0;
    let conf = 0;
    const heat: Record<string, number> = {};
    const confBins = Array.from({ length: 10 }, (_, i) => ({
      bin: `${50 + i * 5}`,
      count: 0,
    }));
    const tempBins = new Map<number, number>();

    for (const d of data) {
      const t = new Date(d.timestamp);

      hourly[t.getHours()]!.count++;

      const key = t.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });

      daily.set(key, (daily.get(key) ?? 0) + 1);

      const c = camById[d.deviceId];

      if (c && isNight(t, c.lat, c.lng)) {
        night++;
      }

      conf += d.confidence;

      const heatKey = `${t.getDay()}-${t.getHours()}`;
      heat[heatKey] = (heat[heatKey] ?? 0) + 1;

      const confidenceBin = Math.min(
        9,
        Math.max(0, Math.floor((d.confidence - 0.5) / 0.05)),
      );

      confBins[confidenceBin]!.count++;

      const temperatureBin = Math.round(d.temperature);
      tempBins.set(
        temperatureBin,
        (tempBins.get(temperatureBin) ?? 0) + 1,
      );
    }

    const peak = hourly.reduce(
      (a, b) => (b.count > a.count ? b : a),
      hourly[0]!,
    );

    return {
      bySp,
      top,
      hourly,
      peak,
      night,
      day: data.length - night,
      avgConf: data.length ? conf / data.length : 0,
      daily: [...daily.entries()]
        .reverse()
        .map(([date, count]) => ({ date, count })),
      heat,
      maxHeat: Math.max(1, ...Object.values(heat)),
      confBins,
      temp: [...tempBins.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([temp, count]) => ({ temp, count })),
      perCam: cameras.map((c) => ({
        name: c.name,
        count: data.filter((d) => d.deviceId === c.id).length,
        low: data.filter(
          (d) => d.deviceId === c.id && d.confidence < 0.6,
        ).length,
      })),
    };
  }, [data, cameras]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Wildlife Analytics"
        subtitle="Statistics calculated from detection records received by EcoVision."
        actions={
          <>
            <select
              className={selectCls}
              value={range}
              onChange={(e) => setRange(+e.target.value)}
              aria-label="Range"
            >
              {[7, 14, 30].map((r) => (
                <option key={r} value={r}>
                  Last {r} days
                </option>
              ))}
            </select>

            <select
              className={selectCls}
              value={camera}
              onChange={(e) => setCamera(e.target.value)}
              aria-label="Camera"
            >
              <option value="all">All cameras</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              className={selectCls}
              value={species}
              onChange={(e) =>
                setSpecies(e.target.value as SpeciesId | "all")
              }
              aria-label="Species"
            >
              <option value="all">All species</option>
              {SPECIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        }
      />

      {!connected && (
        <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
          Backend is disconnected. Displayed statistics may be incomplete
          until the connection is restored.
        </div>
      )}

      {data.length === 0 && (
        <div className="rounded-lg border border-border p-6 text-center">
          <p className="font-medium">No detection records available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No records match the selected time range, camera, and species.
            Statistics will appear when matching records are received.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Stat
          label="Detections"
          value={data.length}
          hint={`${(data.length / range).toFixed(1)} / day`}
        />
        <Stat label="Unique species" value={stats.bySp.length} />
        <Stat
          label="Most frequent"
          value={stats.top ? stats.top.icon : "—"}
          hint={stats.top?.name}
        />
        <Stat
          label="Peak hour"
          value={data.length ? `${stats.peak.h}:00` : "—"}
          hint={data.length ? `${stats.peak.count} detections` : "No records"}
        />
        <Stat
          label="Avg confidence"
          value={
            data.length ? `${Math.round(stats.avgConf * 100)}%` : "—"
          }
        />
        <Stat
          label="Cameras reporting"
          value={new Set(data.map((d) => d.deviceId)).size}
          hint={`of ${cameras.length} registered cameras`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Species frequency" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.bySp}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                {...axis}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis {...axis} />
              <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {stats.bySp.map((s) => (
                  <Cell key={s.id} fill={s.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Species distribution">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={stats.bySp}
                dataKey="count"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
                stroke="var(--card)"
              >
                {stats.bySp.map((s) => (
                  <Cell key={s.id} fill={s.color} />
                ))}
              </Pie>
              <Tooltip {...tip} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Daily detection trend" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={stats.daily}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tip} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--neon)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Day vs night">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={[
                { k: "Day", v: stats.day },
                { k: "Night", v: stats.night },
              ]}
            >
              <XAxis dataKey="k" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="v" name="Detections" radius={[6, 6, 0, 0]}>
                <Cell fill="var(--sunrise)" />
                <Cell fill="var(--chart-4)" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-center text-[11px] text-muted-foreground">
            Night is estimated using sunrise and sunset at each camera location.
          </p>
        </Panel>

        <Panel
          title="Hourly activity heatmap (weekday × hour)"
          className="lg:col-span-2"
        >
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[560px] gap-0.5"
              style={{ gridTemplateColumns: "36px repeat(24, 1fr)" }}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day, dayIndex) => (
                  <div key={day} className="contents">
                    <span className="pr-1 text-right font-mono text-[10px] leading-5 text-muted-foreground">
                      {day}
                    </span>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const count =
                        stats.heat[`${dayIndex}-${hour}`] ?? 0;

                      return (
                        <div
                          key={hour}
                          title={`${day} ${hour}:00 — ${count}`}
                          className="h-5 rounded-sm bg-primary"
                          style={{
                            opacity: count
                              ? 0.15 + 0.85 * (count / stats.maxHeat)
                              : 0.05,
                          }}
                        />
                      );
                    })}
                  </div>
                ),
              )}
              <span />
              {Array.from({ length: 24 }, (_, hour) => (
                <span
                  key={hour}
                  className="text-center font-mono text-[9px] text-muted-foreground"
                >
                  {hour % 3 === 0 ? hour : ""}
                </span>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Confidence distribution">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.confBins}>
              <XAxis dataKey="bin" {...axis} unit="%" />
              <YAxis {...axis} />
              <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
              <Bar
                dataKey="count"
                fill="var(--chart-5)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Temperature during detections"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart>
              <CartesianGrid stroke="var(--border)" />
              <XAxis
                dataKey="temp"
                type="number"
                unit="°C"
                domain={["dataMin", "dataMax"]}
                {...axis}
              />
              <YAxis dataKey="count" {...axis} />
              <ZAxis range={[60, 60]} />
              <Tooltip {...tip} />
              <Scatter data={stats.temp} fill="var(--sunrise)" />
            </ScatterChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Camera trap performance">
          <ul className="space-y-3 text-sm">
            {stats.perCam.map((c) => (
              <li key={c.name}>
                <div className="flex justify-between">
                  <span>{c.name}</span>
                  <span className="font-mono text-xs">{c.count}</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-secondary">
                  <div
                    className="h-full rounded bg-primary"
                    style={{
                      width: `${(c.count / Math.max(1, data.length)) * 100}%`,
                    }}
                  />
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {c.low} low-confidence
                </div>
              </li>
            ))}
            {stats.perCam.length === 0 && (
              <li className="text-muted-foreground">
                No registered cameras available.
              </li>
            )}
          </ul>
        </Panel>
      </div>

      <p className="text-xs text-muted-foreground">
        Species reference:{" "}
        {SPECIES.map(
          (s) => `${s.icon} ${SPECIES_MAP[s.id].scientific}`,
        ).join(" · ")}
      </p>
    </div>
  );
}
