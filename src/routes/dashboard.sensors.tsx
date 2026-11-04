
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Droplets,
  Thermometer,
  Waves,
  Wifi,
} from "lucide-react";
import { useEco } from "@/lib/ecovision/store";
import { PageHeader, Panel, Stat } from "@/components/eco/ui";
import { ago } from "@/lib/ecovision/format";

export const Route = createFileRoute("/dashboard/sensors")({
  head: () => ({
    meta: [
      { title: "Sensors — EcoVision" },
      {
        name: "description",
        content: "Environmental sensor readings and PIR status.",
      },
    ],
  }),
  component: Sensors,
});

const KEY = "ecovision.thresholds";

type Thresholds = {
  tMax: number;
  tMin: number;
  hMax: number;
  hMin: number;
};

const DEFAULT_THRESHOLDS: Thresholds = {
  tMax: 34,
  tMin: 12,
  hMax: 90,
  hMin: 30,
};

const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
};

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false as const,
  axisLine: false as const,
};

function readThresholds(): Thresholds {
  try {
    const saved = localStorage.getItem(KEY);
    if (!saved) return DEFAULT_THRESHOLDS;

    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_THRESHOLDS;
    }

    const value = parsed as Partial<Thresholds>;

    return {
      tMax: typeof value.tMax === "number" ? value.tMax : 34,
      tMin: typeof value.tMin === "number" ? value.tMin : 12,
      hMax: typeof value.hMax === "number" ? value.hMax : 90,
      hMin: typeof value.hMin === "number" ? value.hMin : 30,
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function Sensors() {
  const { sensors, connected } = useEco();
  const [th, setTh] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [thresholdsLoaded, setThresholdsLoaded] = useState(false);

  useEffect(() => {
    setTh(readThresholds());
    setThresholdsLoaded(true);
  }, []);

  const update = (key: keyof Thresholds, value: number) => {
    const next = { ...th, [key]: value };
    setTh(next);

    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Thresholds still work for the current page session.
    }
  };

  const latest = [...sensors]
    .reverse()
    .find((sensor) => sensor.temperature !== null) ?? sensors.at(-1);

  const last = sensors.at(-1);

  const stale = last
    ? !Number.isFinite(new Date(last.timestamp).getTime()) ||
      Date.now() - new Date(last.timestamp).getTime() > 20 * 60_000
    : true;

  const errors = sensors.filter((sensor) => sensor.temperature === null);

  const chart = sensors.map((sensor) => ({
    t: new Date(sensor.timestamp).toLocaleString([], {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    temp: sensor.temperature,
    hum: sensor.humidity,
  }));

  const tBreach =
    latest?.temperature != null &&
    (latest.temperature > th.tMax || latest.temperature < th.tMin);

  const noData = sensors.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Environmental Monitoring"
        subtitle="Temperature, humidity and PIR readings reported by the connected sensor backend."
      />

      {!connected && (
        <div className="rounded-lg border border-border bg-secondary p-3 text-sm text-muted-foreground">
          Backend disconnected. Sensor values may be outdated until the
          connection is restored.
        </div>
      )}

      {noData ? (
        <div className="panel p-6 text-center">
          <Wifi className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="font-display text-lg">No sensor readings available</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The backend has not supplied any sensor readings yet. Connect your
            sensor device and check that its readings are being sent to the
            backend.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Temperature"
              icon={<Thermometer className="h-4 w-4 text-sunrise" />}
              value={
                <span className={tBreach ? "text-destructive" : ""}>
                  {latest?.temperature?.toFixed(1) ?? "—"}°C
                </span>
              }
              hint={`Range ${th.tMin}–${th.tMax}°C`}
            />

            <Stat
              label="Humidity"
              icon={<Droplets className="h-4 w-4 text-chart-4" />}
              value={`${latest?.humidity ?? "—"}%`}
              hint={`Range ${th.hMin}–${th.hMax}%`}
            />

            <Stat
              label="PIR motion"
              icon={<Waves className="h-4 w-4 text-primary" />}
              value={
                last?.motion == null
                  ? "Unknown"
                  : last.motion
                    ? "Triggered"
                    : "Clear"
              }
              hint={last ? `Updated ${ago(last.timestamp)}` : "No latest reading"}
            />

            <Stat
              label="Sensor health"
              icon={<Wifi className="h-4 w-4" />}
              value={
                <span
                  className={
                    stale ? "text-warning" : "text-neon"
                  }
                >
                  {stale ? "Stale" : "Recent"}
                </span>
              }
              hint={`${errors.length} missing temperature readings in loaded data`}
            />
          </div>

          {errors.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {errors.length} sensor reading(s) have no temperature value.
              Check the device and backend logs to identify the cause.
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Temperature">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chart}>
                  <defs>
                    <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0"
                        stopColor="var(--sunrise)"
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="1"
                        stopColor="var(--sunrise)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis dataKey="t" {...axis} minTickGap={40} />
                  <YAxis
                    {...axis}
                    unit="°"
                    domain={["dataMin - 2", "dataMax + 2"]}
                  />
                  <Tooltip {...tip} />
                  <ReferenceLine
                    y={th.tMax}
                    stroke="var(--destructive)"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={th.tMin}
                    stroke="var(--chart-4)"
                    strokeDasharray="4 4"
                  />
                  <Area
                    dataKey="temp"
                    stroke="var(--sunrise)"
                    fill="url(#gt)"
                    strokeWidth={2}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Humidity">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chart}>
                  <defs>
                    <linearGradient id="gh" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0"
                        stopColor="var(--chart-4)"
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="1"
                        stopColor="var(--chart-4)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis dataKey="t" {...axis} minTickGap={40} />
                  <YAxis {...axis} unit="%" />
                  <Tooltip {...tip} />
                  <ReferenceLine
                    y={th.hMax}
                    stroke="var(--destructive)"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={th.hMin}
                    stroke="var(--warning)"
                    strokeDasharray="4 4"
                  />
                  <Area
                    dataKey="hum"
                    stroke="var(--chart-4)"
                    fill="url(#gh)"
                    strokeWidth={2}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        </>
      )}

      <Panel title="Alert thresholds">
        <p className="mb-4 text-sm text-muted-foreground">
          These thresholds are saved in this browser. They do not configure
          device-side alerts unless your backend implements threshold
          synchronization.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["tMin", "Min temp °C"],
              ["tMax", "Max temp °C"],
              ["hMin", "Min humidity %"],
              ["hMax", "Max humidity %"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                type="number"
                value={th[key]}
                disabled={!thresholdsLoaded}
                onChange={(event) => update(key, Number(event.target.value))}
                className="mt-1 h-9 w-full rounded-md border border-input bg-secondary px-3 font-mono"
              />
            </label>
          ))}
        </div>
      </Panel>
    </div>
  );
}
