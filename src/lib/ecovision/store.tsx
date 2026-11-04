
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  Alert,
  CameraTrap,
  Detection,
  SensorReading,
  SpeciesId,
  Severity,
  CameraState,
} from "./types";

import { API_URL } from "./config";
import { supabase } from "./supabase";
import { SPECIES } from "./species";

interface Store {
  demo: boolean;
  connected: boolean;
  lastEventAt: number | null;
  cameras: CameraTrap[];
  detections: Detection[];
  sensors: SensorReading[];
  alerts: Alert[];
  markRead: (id: string, read?: boolean) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

type Raw = Record<string, any>;

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`Unable to get Supabase session: ${error.message}`);
  }

  if (!session?.access_token) {
    throw new Error("No active Supabase session. Please log in again.");
  }

  return session.access_token;
}

async function fetchApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!API_URL) {
    throw new Error("Backend URL is not configured.");
  }

  const token = await getAccessToken();

  const response = await fetch(`${API_URL}/api/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `API request failed: ${path} (${response.status}) ${message}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function validString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validTimestamp(value: unknown): string {
  if (typeof value !== "string" || !value) return "";

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

// Validate against the actual 53-species registry.
function validSpecies(value: unknown): SpeciesId {
  if (typeof value !== "string") return "unknown";

  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");

  const match = SPECIES.find(
    (item) => item.id.toLowerCase() === normalized,
  );

  return (match?.id ?? "unknown") as SpeciesId;
}

function validSeverity(value: unknown): Severity {
  const allowed: Severity[] = [
    "info",
    "low",
    "medium",
    "high",
    "critical",
  ];

  return allowed.includes(value as Severity)
    ? (value as Severity)
    : "info";
}

function validCameraState(value: unknown): CameraState {
  const allowed: CameraState[] = [
    "offline",
    "idle",
    "recording",
    "live",
  ];

  return allowed.includes(value as CameraState)
    ? (value as CameraState)
    : "offline";
}

function normalizeCamera(raw: Raw): CameraTrap {
  return {
    id: validString(raw.id),
    deviceId: validString(raw.deviceId ?? raw.device_id),
    name: validString(raw.name),
    lat: nullableNumber(raw.lat ?? raw.latitude),
    lng: nullableNumber(raw.lng ?? raw.longitude),
    state: validCameraState(raw.state),
    battery: nullableNumber(raw.battery),
    signal: nullableNumber(raw.signal),
    storagePct: nullableNumber(raw.storagePct ?? raw.storage_pct),
    firmware: raw.firmware ?? null,
    lastSeen: raw.lastSeen
      ? validTimestamp(raw.lastSeen)
      : raw.last_seen
        ? validTimestamp(raw.last_seen)
        : null,
    streamUrl: raw.streamUrl ?? raw.stream_url ?? null,
    active: typeof raw.active === "boolean" ? raw.active : undefined,
    timezone: raw.timezone ?? null,
  };
}

// Generate a URL for private Supabase Storage images.
async function resolveImageUrl(raw: Raw): Promise<string | null> {
  const directUrl =
    raw.thumbnail ??
    raw.image_url ??
    raw.imageUrl ??
    raw.capture_url ??
    raw.photo_url ??
    raw.frame_url ??
    raw.image;

  if (
    typeof directUrl === "string" &&
    /^https?:\/\//i.test(directUrl)
  ) {
    return directUrl;
  }

  const imagePath =
    typeof raw.image_path === "string"
      ? raw.image_path
      : typeof directUrl === "string"
        ? directUrl
        : null;

  if (!imagePath) return null;

  // Already a complete URL.
  if (/^https?:\/\//i.test(imagePath)) {
    return imagePath;
  }

  const cleanPath = imagePath.replace(/^\/+/, "");

  try {
    const { data, error } = await supabase.storage
      .from("wildlife-captures")
      .createSignedUrl(cleanPath, 3600);

    if (error) {
      console.error("Unable to generate detection image URL:", error);
      return null;
    }

    return data?.signedUrl ?? null;
  } catch (error) {
    console.error("Image URL resolution failed:", error);
    return null;
  }
}

async function normalizeDetection(rawInput: Raw): Promise<Detection> {
  // Support both a flat detection and the API's nested saved_detection.
  const raw = rawInput.saved_detection
    ? { ...rawInput.saved_detection, ...rawInput }
    : rawInput;

  const camera = Array.isArray(raw.camera_traps)
    ? raw.camera_traps[0]
    : raw.camera_traps;

  const bboxValue = raw.bbox;

  const bbox =
    Array.isArray(bboxValue) &&
    bboxValue.length === 4 &&
    bboxValue.every((value: unknown) =>
      Number.isFinite(Number(value)),
    )
      ? (bboxValue.map(Number) as [
          number,
          number,
          number,
          number,
        ])
      : undefined;

  const confidence = nullableNumber(raw.confidence) ?? 0;

  const species = validSpecies(
    raw.species ?? raw.species_id,
  );

  let severity = validSeverity(raw.severity);

  if (!raw.severity) {
    severity =
      confidence < 0.6
        ? "low"
        : ["tiger", "leopard", "dhole"].includes(species)
          ? "critical"
          : "medium";
  }

  const status =
    raw.status === "confirmed" ||
    raw.status === "pending" ||
    raw.status === "low_confidence"
      ? raw.status
      : confidence < 0.6
        ? "low_confidence"
        : "confirmed";

  const thumbnail = await resolveImageUrl(raw);

  return {
    id: validString(raw.id),
    species,
    confidence,
    timestamp: validTimestamp(
      raw.timestamp ?? raw.detected_at ?? raw.created_at,
    ),
    deviceId: validString(
      raw.deviceId ??
        raw.device_id ??
        camera?.device_id ??
        raw.camera_id,
    ),
    temperature: nullableNumber(raw.temperature),
    humidity: nullableNumber(raw.humidity),
    motion:
      typeof (raw.motion ?? raw.motion_detected) === "boolean"
        ? (raw.motion ?? raw.motion_detected)
        : null,
    status,
    severity,
    bbox,
    thumbnail,
  };
}

function normalizeSensor(raw: Raw): SensorReading {
  const camera = Array.isArray(raw.camera_traps)
    ? raw.camera_traps[0]
    : raw.camera_traps;

  return {
    timestamp: validTimestamp(raw.timestamp ?? raw.recorded_at),
    deviceId: validString(
      raw.deviceId ?? raw.device_id ?? camera?.device_id,
    ),
    temperature: nullableNumber(raw.temperature),
    humidity: nullableNumber(raw.humidity),
    motion:
      typeof (raw.motion ?? raw.motion_detected) === "boolean"
        ? (raw.motion ?? raw.motion_detected)
        : null,
  };
}

function normalizeAlert(raw: Raw): Alert {
  const camera = Array.isArray(raw.camera_traps)
    ? raw.camera_traps[0]
    : raw.camera_traps;

  const allowedTypes: Alert["type"][] = [
    "animal_detected",
    "priority_species",
    "camera_disconnected",
    "sensor_malfunction",
    "mqtt_lost",
    "storage_warning",
    "low_confidence",
    "unusual_frequency",
  ];

  const type = allowedTypes.includes(raw.type)
    ? raw.type
    : "animal_detected";

  return {
    id: validString(raw.id),
    type,
    severity: validSeverity(raw.severity),
    title: validString(raw.title),
    message: validString(raw.message),
    timestamp: validTimestamp(raw.timestamp ?? raw.created_at),
    deviceId: validString(
      raw.deviceId ?? raw.device_id ?? camera?.device_id,
    ),
    read: Boolean(raw.read),
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;

    seen.add(item.id);
    return true;
  });
}

export function EcoProvider({ children }: { children: ReactNode }) {
  const [cameras, setCameras] = useState<CameraTrap[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  useEffect(() => {
    let disposed = false;
    let eventSource: EventSource | null = null;

    const loadCameras = async () => {
      const rows = await fetchApi<Raw[]>("cameras");

      if (!disposed) {
        setCameras(rows.map(normalizeCamera));
      }
    };

    const loadDetections = async () => {
      const rows = await fetchApi<Raw[]>("detections?limit=2000");

      const normalized = await Promise.all(
        rows.map(normalizeDetection),
      );

      if (!disposed) {
        setDetections(
          uniqueById(normalized).filter((item) => item.timestamp),
        );
      }
    };

    const loadSensors = async () => {
      const rows = await fetchApi<Raw[]>("sensors?hours=72");

      if (!disposed) {
        setSensors(
          rows
            .map(normalizeSensor)
            .filter((item) => item.timestamp),
        );
      }
    };

    const loadAlerts = async () => {
      const rows = await fetchApi<Raw[]>("alerts");

      if (!disposed) {
        setAlerts(
          uniqueById(rows.map(normalizeAlert)).filter(
            (item) => item.timestamp,
          ),
        );
      }
    };

    const loadInitialData = async () => {
      const results = await Promise.allSettled([
        loadCameras(),
        loadDetections(),
        loadSensors(),
        loadAlerts(),
      ]);

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            `EcoVision initial data request ${index + 1} failed:`,
            result.reason,
          );
        }
      });
    };

    const ingestDetection = async (raw: Raw) => {
      if (disposed) return;

      try {
        const detection = await normalizeDetection(raw);

        if (disposed || !detection.id || !detection.timestamp) {
          return;
        }

        setDetections((previous) => {
          const withoutDuplicate = previous.filter(
            (item) => item.id !== detection.id,
          );

          return [detection, ...withoutDuplicate].slice(0, 5000);
        });

        setLastEventAt(Date.now());
      } catch (error) {
        console.error("Unable to process detection:", error);
      }
    };

    const ingestSensor = (raw: Raw) => {
      if (disposed) return;

      const reading = normalizeSensor(raw);
      if (!reading.timestamp) return;

      setSensors((previous) => {
        const exists = previous.some(
          (item) =>
            item.deviceId === reading.deviceId &&
            item.timestamp === reading.timestamp,
        );

        return exists ? previous : [...previous, reading].slice(-5000);
      });

      setLastEventAt(Date.now());
    };

    const start = async () => {
      if (!API_URL) {
        console.error(
          "EcoVision backend URL is missing. Configure VITE_ECOVISION_API_URL.",
        );
        return;
      }

      await loadInitialData();

      if (disposed) return;

      eventSource = new EventSource(`${API_URL}/api/events/stream`);

      eventSource.onopen = () => {
        if (!disposed) setConnected(true);
      };

      eventSource.onerror = () => {
        if (!disposed) setConnected(false);
      };

      eventSource.addEventListener("detection", (event) => {
        try {
          void ingestDetection(
            JSON.parse((event as MessageEvent).data) as Raw,
          );
        } catch (error) {
          console.error("Invalid detection event:", error);
        }
      });

      eventSource.addEventListener("sensor", (event) => {
        try {
          ingestSensor(
            JSON.parse((event as MessageEvent).data) as Raw,
          );
        } catch (error) {
          console.error("Invalid sensor event:", error);
        }
      });

      eventSource.addEventListener("camera", () => {
        void loadCameras().catch((error) =>
          console.error("Unable to refresh camera status:", error),
        );

        if (!disposed) setLastEventAt(Date.now());
      });

      eventSource.addEventListener("alert", () => {
        void loadAlerts().catch((error) =>
          console.error("Unable to refresh alerts:", error),
        );

        if (!disposed) setLastEventAt(Date.now());
      });
    };

    void start();

    return () => {
      disposed = true;
      eventSource?.close();
    };
  }, []);

  const markRead = async (id: string, read = true) => {
    await fetchApi<Raw>(
      `alerts/${encodeURIComponent(id)}?read=${read}`,
      { method: "PATCH" },
    );

    setAlerts((previous) =>
      previous.map((alert) =>
        alert.id === id ? { ...alert, read } : alert,
      ),
    );
  };

  const markAllRead = async () => {
    const unreadAlerts = alerts.filter((alert) => !alert.read);

    await Promise.all(
      unreadAlerts.map((alert) =>
        fetchApi<Raw>(
          `alerts/${encodeURIComponent(alert.id)}?read=true`,
          { method: "PATCH" },
        ),
      ),
    );

    setAlerts((previous) =>
      previous.map((alert) => ({ ...alert, read: true })),
    );
  };

  const value = useMemo<Store>(
    () => ({
      demo: false,
      connected,
      lastEventAt,
      cameras,
      detections,
      sensors,
      alerts,
      markRead,
      markAllRead,
    }),
    [
      connected,
      lastEventAt,
      cameras,
      detections,
      sensors,
      alerts,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEco() {
  const value = useContext(Ctx);

  if (!value) {
    throw new Error("useEco must be inside EcoProvider");
  }

  return value;
}
