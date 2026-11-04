
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  CalendarClock,
  ChartBar,
  List,
  LogOut,
  Map,
  Menu,
  Settings,
  Thermometer,
  Video,
  ScanEye,
  X,
} from "lucide-react";
import { EcoProvider, useEco } from "@/lib/ecovision/store";
import { getUser, signOut } from "@/lib/ecovision/auth";
import { ago } from "@/lib/ecovision/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — EcoVision" },
      {
        name: "description",
        content: "Live wildlife camera trap monitoring.",
      },
    ],
  }),
  component: Layout,
});

const NAV = [
  { to: "/dashboard", label: "Live Monitor", icon: Video, exact: true },
  { to: "/dashboard/timeline", label: "Activity Timeline", icon: CalendarClock },
  { to: "/dashboard/analytics", label: "Analytics", icon: ChartBar },
  { to: "/dashboard/map", label: "Trap Map", icon: Map },
  { to: "/dashboard/detections", label: "Detections", icon: List },
  { to: "/dashboard/sensors", label: "Sensors", icon: Thermometer },
  { to: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

function Layout() {
  const nav = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      try {
        const user = await getUser();

        if (!active) return;

        if (!user) {
          await nav({ to: "/login", replace: true });
          return;
        }

        setAuthenticated(true);
      } catch {
        if (active) {
          await nav({ to: "/login", replace: true });
        }
      } finally {
        if (active) setCheckingAuth(false);
      }
    }

    void checkAuth();

    return () => {
      active = false;
    };
  }, [nav]);

  if (checkingAuth || !authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Checking your EcoVision session...
        </p>
      </main>
    );
  }

  return (
    <EcoProvider>
      <Shell />
    </EcoProvider>
  );
}

function Shell() {
  const { alerts, cameras, connected, lastEventAt } = useEco();
  const path = useRouterState({
    select: (state) => state.location.pathname,
  });

  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  const nav = useNavigate();
  const unread = alerts.filter((alert) => !alert.read).length;

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const user = await getUser();
        if (active) setEmail(user?.email ?? null);
      } catch {
        if (active) setEmail(null);
      }
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  async function handleSignOut() {
    setLoggingOut(true);
    setLogoutError("");

    try {
      await signOut();
      await nav({ to: "/login", replace: true });
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : "Unable to sign out. Please try again.",
      );
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-lg"
          >
            <ScanEye className="h-5 w-5 text-neon" />
            EcoVision
          </Link>

          <button
            type="button"
            className="lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => {
            const active =
              "exact" in item
                ? path === item.to || path === `${item.to}/`
                : path.startsWith(item.to);

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
                  active &&
                    "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <item.icon
                  className={cn("h-4 w-4", active && "text-neon")}
                />

                {item.label}

                {item.label === "Alerts" && unread > 0 && (
                  <span className="ml-auto rounded-full bg-destructive px-1.5 font-mono text-[10px] text-destructive-foreground">
                    {unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-sidebar-border p-4 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected ? "bg-neon pulse-dot" : "bg-destructive",
              )}
            />
            {connected ? "Backend event stream connected" : "Backend disconnected"}
          </div>

          <div className="text-muted-foreground">
            Last event: {lastEventAt ? ago(lastEventAt) : "—"}
          </div>

          <div className="text-muted-foreground">
            {cameras.length} registered camera{cameras.length !== 1 && "s"}
          </div>

          {logoutError && (
            <p role="alert" className="text-destructive">
              {logoutError}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">
              {email ?? "Checking account..."}
            </span>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={loggingOut}
              aria-label="Sign out"
              title="Sign out"
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {loggingOut && (
            <p className="text-muted-foreground">Signing out...</p>
          )}
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-background/70 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:px-8">
          <button
            type="button"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Activity className="h-4 w-4 text-primary" />

          <span className="font-mono text-xs text-muted-foreground">
            EcoVision · Wildlife Monitoring
          </span>

          <span
            className={cn(
              "ml-auto rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider",
              connected
                ? "border-primary/40 text-primary"
                : "border-destructive/40 text-destructive",
            )}
          >
            {connected ? "Connected" : "Disconnected"}
          </span>
        </header>

        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
