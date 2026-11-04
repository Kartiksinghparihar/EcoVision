
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { useEco } from "@/lib/ecovision/store";
import { SPECIES, SPECIES_MAP } from "@/lib/ecovision/species";
import {
  PageHeader,
  Panel,
  SeverityBadge,
  btnCls,
  selectCls,
} from "@/components/eco/ui";
import { downloadCSV, fmtDateTime, pct } from "@/lib/ecovision/format";

export const Route = createFileRoute("/dashboard/detections")({
  head: () => ({
    meta: [
      { title: "Detections — EcoVision" },
      {
        name: "description",
        content: "Searchable wildlife detection history.",
      },
    ],
  }),
  component: Detections,
});

const PAGE = 25;

function Detections() {
  const { detections, cameras, connected } = useEco();

  const [q, setQ] = useState("");
  const [sp, setSp] = useState("all");
  const [cam, setCam] = useState("all");
  const [minConf, setMinConf] = useState(0);
  const [page, setPage] = useState(0);

  const rows = useMemo(
    () =>
      detections.filter((d) => {
        const speciesName = SPECIES_MAP[d.species]?.name ?? d.species;

        return (
          (sp === "all" || d.species === sp) &&
          (cam === "all" || d.deviceId === cam) &&
          d.confidence >= minConf / 100 &&
          (!q ||
            speciesName.toLowerCase().includes(q.toLowerCase()) ||
            d.deviceId.toLowerCase().includes(q.toLowerCase()))
        );
      }),
    [detections, sp, cam, minConf, q],
  );

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const visibleRows = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div>
      <PageHeader
        title="Detection History"
        subtitle={`${rows.length} records`}
        actions={
          <button
            className={btnCls}
            onClick={() => downloadCSV(rows)}
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        }
      />

      <Panel bodyClass="p-0">
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <label className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Search species or device"
              className={`${selectCls} pl-8`}
              aria-label="Search species or device"
            />
          </label>

          <select
            className={selectCls}
            value={sp}
            onChange={(e) => {
              setSp(e.target.value);
              setPage(0);
            }}
            aria-label="Species"
          >
            <option value="all">All species</option>
            {SPECIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            className={selectCls}
            value={cam}
            onChange={(e) => {
              setCam(e.target.value);
              setPage(0);
            }}
            aria-label="Camera"
          >
            <option value="all">All cameras</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Min confidence {minConf}%
            <input
              type="range"
              min={0}
              max={95}
              step={5}
              value={minConf}
              onChange={(e) => {
                setMinConf(+e.target.value);
                setPage(0);
              }}
              aria-label="Minimum confidence"
            />
          </label>
        </div>

        {!connected && (
          <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            Live event stream is disconnected. Showing data currently loaded.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                {[
                  "Species",
                  "Confidence",
                  "Time",
                  "Camera",
                  "Temp / RH",
                  "Status",
                  "Severity",
                ].map((heading) => (
                  <th key={heading} className="px-4 py-2 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((d) => {
                const species = SPECIES_MAP[d.species];

                return (
                  <tr
                    key={d.id}
                    className="border-b border-border/50 hover:bg-secondary/50"
                  >
                    <td className="px-4 py-2">
                      <span className="mr-2 text-lg">
                        {species?.icon ?? "🐾"}
                      </span>
                      {species?.name ?? d.species}
                    </td>
                    <td
                      className={`px-4 py-2 font-mono ${
                        d.confidence < 0.6
                          ? "text-warning"
                          : "text-primary"
                      }`}
                    >
                      {pct(d.confidence)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {fmtDateTime(d.timestamp)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {d.deviceId}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {d.temperature}°C · {d.humidity}%
                    </td>
                    <td className="px-4 py-2 text-xs capitalize">
                      {d.status.replace("_", " ")}
                    </td>
                    <td className="px-4 py-2">
                      <SeverityBadge s={d.severity} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {detections.length === 0
                ? "No detections have been received from the backend yet."
                : "No detections match your filters."}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-3 text-xs text-muted-foreground">
          <span>
            Page {page + 1} of {pages}
          </span>
          <div className="flex gap-2">
            <button
              className={btnCls}
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <button
              className={btnCls}
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
