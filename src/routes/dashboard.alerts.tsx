
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, CheckCheck, Circle } from "lucide-react";
import { useEco } from "@/lib/ecovision/store";
import {
  PageHeader,
  Panel,
  SeverityBadge,
  btnCls,
  selectCls,
} from "@/components/eco/ui";
import { ago, fmtDateTime } from "@/lib/ecovision/format";
import type { Severity } from "@/lib/ecovision/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — EcoVision" },
      {
        name: "description",
        content: "Wildlife and system notifications.",
      },
    ],
  }),
  component: Alerts,
});

const SEV: Severity[] = ["critical", "high", "medium", "low", "info"];

function Alerts() {
  const { alerts, markRead, markAllRead } = useEco();
  const [sev, setSev] = useState("all");
  const [state, setState] = useState<"all" | "unread" | "read">("all");

  const rows = useMemo(
    () =>
      alerts.filter(
        (alert) =>
          (sev === "all" || alert.severity === sev) &&
          (state === "all" ||
            (state === "unread" ? !alert.read : alert.read)),
      ),
    [alerts, sev, state],
  );

  const unreadCount = alerts.filter((alert) => !alert.read).length;

  return (
    <div>
      <PageHeader
        title="Alerts & Notifications"
        subtitle={`${unreadCount} unread`}
        actions={
          <>
            <select
              className={selectCls}
              value={sev}
              onChange={(e) => setSev(e.target.value)}
              aria-label="Severity"
            >
              <option value="all">All severities</option>
              {SEV.map((severity) => (
                <option key={severity} value={severity} className="capitalize">
                  {severity}
                </option>
              ))}
            </select>

            <select
              className={selectCls}
              value={state}
              onChange={(e) =>
                setState(e.target.value as typeof state)
              }
              aria-label="Read state"
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>

            <button className={btnCls} onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          </>
        }
      />

      <Panel bodyClass="p-0">
        <ul className="divide-y divide-border">
          {rows.map((alert) => (
            <li
              key={alert.id}
              className={cn(
                "flex items-start gap-4 px-4 py-3",
                !alert.read && "bg-accent/30",
              )}
            >
              <Circle
                className={cn(
                  "mt-1.5 h-2.5 w-2.5 shrink-0",
                  alert.read
                    ? "text-transparent"
                    : "fill-neon text-neon",
                )}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{alert.title}</span>
                  <SeverityBadge s={alert.severity} />
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">
                    {alert.type.replace(/_/g, " ")}
                  </span>
                </div>

                <p className="mt-0.5 text-sm text-muted-foreground">
                  {alert.message}
                </p>

                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {fmtDateTime(alert.timestamp)} · {ago(alert.timestamp)}
                  {alert.deviceId && ` · ${alert.deviceId}`}
                </p>
              </div>

              <button
                onClick={() => markRead(alert.id, !alert.read)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {alert.read ? "Mark unread" : "Mark read"}
              </button>
            </li>
          ))}

          {rows.length === 0 && (
            <li className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Bell className="h-6 w-6" />
              {alerts.length === 0
                ? "No alerts have been received from the backend yet."
                : "No alerts match these filters."}
            </li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
