
import { useEffect, useRef } from "react";
import type { CameraTrap, Detection } from "@/lib/ecovision/types";
import { SPECIES_MAP } from "@/lib/ecovision/species";

const STATE_COLOR: Record<string, string> = {
  offline: "#89949a",
  idle: "#e0b44a",
  recording: "#e8553f",
  live: "#5cf08a",
};

const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

interface TrapMapProps {
  cameras: CameraTrap[];
  detections: Detection[];
  showHeat: boolean;
  onSelect: (id: string) => void;
  selected: string | null;
}

function validCoordinates(camera: CameraTrap): boolean {
  const lat = Number(camera.lat);
  const lng = Number(camera.lng);

  return (
    camera.lat !== null &&
    camera.lat !== undefined &&
    camera.lng !== null &&
    camera.lng !== undefined &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Satellite-based Leaflet map for EcoVision camera traps. */
export default function TrapMap({
  cameras,
  detections,
  showHeat,
  onSelect,
  selected,
}: TrapMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);

  const dataRef = useRef({
    cameras,
    detections,
    showHeat,
    onSelect,
    selected,
  });

  dataRef.current = {
    cameras,
    detections,
    showHeat,
    onSelect,
    selected,
  };

  // Initialize the satellite map once.
  useEffect(() => {
    let cancelled = false;

    import("leaflet").then((mod) => {
      if (cancelled || !el.current || map.current) return;

      const leaflet = mod.default ?? mod;
      L.current = leaflet;

      const validCameras = dataRef.current.cameras.filter(
        validCoordinates,
      );

      const initialCamera = validCameras[0];

      const initialPosition: [number, number] = initialCamera
        ? [Number(initialCamera.lat), Number(initialCamera.lng)]
        : [21.698, 80.62];

      const m = leaflet.map(el.current, {
        zoomControl: false,
        scrollWheelZoom: true,
        preferCanvas: true,
      });

      m.setView(initialPosition, initialCamera ? 14 : 6);

      // Satellite imagery basemap.
      leaflet
        .tileLayer(SATELLITE_URL, {
          attribution: SATELLITE_ATTRIBUTION,
          maxZoom: 19,
          maxNativeZoom: 18,
        })
        .addTo(m);

      leaflet.control
        .zoom({ position: "bottomright" })
        .addTo(m);

      const markerLayer = leaflet.layerGroup().addTo(m);

      layer.current = markerLayer;
      map.current = m;

      draw();
      setTimeout(() => m.invalidateSize(), 100);
    });

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      layer.current = null;
      L.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers and activity zones when data changes.
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameras, detections, showHeat, selected]);

  function draw() {
    const leaflet = L.current;
    const markerLayer = layer.current;

    if (!leaflet || !markerLayer || !map.current) return;

    markerLayer.clearLayers();

    const {
      cameras: currentCameras,
      detections: currentDetections,
      showHeat: currentShowHeat,
      onSelect: selectCamera,
      selected: selectedCamera,
    } = dataRef.current;

    const validCameras = currentCameras.filter(validCoordinates);

    for (const camera of validCameras) {
      const cameraDetections = currentDetections.filter(
        (d) => d.deviceId === camera.id,
      );

      const count = cameraDetections.length;
      const lastDetection = cameraDetections[0];
      const color = STATE_COLOR[camera.state] ?? STATE_COLOR.offline;
      const isSelected = camera.id === selectedCamera;

      // Inferred activity zone, not an animal territory.
      if (currentShowHeat && count > 0) {
        leaflet
          .circle(
            [Number(camera.lat), Number(camera.lng)],
            {
              radius: Math.min(150 + count * 12, 600),
              color: "#72f0a1",
              weight: 1.5,
              dashArray: "5 6",
              fillColor: "#5cf08a",
              fillOpacity: 0.15,
            },
          )
          .addTo(markerLayer);
      }

      const speciesIcon = lastDetection
        ? SPECIES_MAP[lastDetection.species]?.icon ?? "🐾"
        : "📷";

      const markerIcon = leaflet.divIcon({
        className: "ecovision-satellite-marker",
        html: `
          <div style="
            position:relative;
            display:flex;
            align-items:center;
            justify-content:center;
            width:42px;
            height:42px;
            border-radius:50%;
            background:rgba(12,22,19,0.94);
            border:2px solid ${color};
            box-shadow:0 0 ${isSelected ? 24 : 12}px ${color};
            font-size:19px;
            transform:${isSelected ? "scale(1.12)" : "scale(1)"};
            transition:all 180ms ease;
          ">
            ${speciesIcon}
            <span style="
              position:absolute;
              width:10px;
              height:10px;
              right:-2px;
              top:-2px;
              border-radius:50%;
              background:${color};
              border:2px solid #111a16;
            "></span>
          </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });

      leaflet
        .marker(
          [Number(camera.lat), Number(camera.lng)],
          { icon: markerIcon },
        )
        .addTo(markerLayer)
        .on("click", () => selectCamera(camera.id))
        .bindTooltip(
          `<strong>${escapeHtml(camera.name || "Camera")}</strong><br/>
           ${escapeHtml(camera.state.toUpperCase())}<br/>
           ${count} recorded sightings`,
        );
    }

    // Fit the map to registered camera locations only on initial data load.
    if (validCameras.length > 0 && !map.current.hasLayer(markerLayer)) {
      map.current.addLayer(markerLayer);
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#101a16]">
      <div ref={el} className="h-full w-full" />

      <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-lg border border-white/15 bg-black/65 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2 font-semibold">
          <span className="h-2 w-2 rounded-full bg-green-400" />
          SATELLITE VIEW
        </div>
        <div className="mt-1 text-white/65">
          {cameras.filter(validCoordinates).length} mapped cameras
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-[500] rounded-lg border border-white/15 bg-black/65 p-3 text-xs text-white shadow-lg backdrop-blur-md">
        <div className="mb-2 font-semibold">CAMERA STATUS</div>
        {Object.entries(STATE_COLOR).map(([state, color]) => (
          <div key={state} className="mb-1 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="capitalize text-white/80">{state}</span>
          </div>
        ))}
      </div>

      {cameras.length > 0 &&
        cameras.filter(validCoordinates).length === 0 && (
          <div className="absolute inset-0 z-[450] flex items-center justify-center bg-black/50 p-6 text-center text-sm text-white">
            No cameras have valid geographical coordinates yet.
          </div>
        )}
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[character];
  });
}
