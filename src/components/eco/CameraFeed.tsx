
import type { CameraTrap, Detection } from "@/lib/ecovision/types";
import { SPECIES } from "@/lib/ecovision/species";

interface CameraFeedProps {
  camera: CameraTrap;
  latest?: Detection;
  playback: Detection | null;
  onExitPlayback: () => void;
  demo: boolean;
}

export function CameraFeed({
  latest,
  playback,
  onExitPlayback,
  demo,
}: CameraFeedProps) {
  // Selected playback takes priority over the latest detection.
  const candidate = playback ?? latest;

  // Support additional fields returned by the API or Supabase.
  const candidateData = candidate as
    | (Detection & Record<string, unknown>)
    | undefined;

  // Read species from available field names.
  const rawSpecies =
    typeof candidateData?.species === "string"
      ? candidateData.species
      : typeof candidateData?.label === "string"
        ? candidateData.label
        : typeof candidateData?.animal_name === "string"
          ? candidateData.animal_name
          : typeof candidateData?.class_name === "string"
            ? candidateData.class_name
            : typeof candidateData?.class === "string"
              ? candidateData.class
              : "";

  // Normalize values such as "polar_bear", "Polar Bear",
  // and "polar-bear" before validating them.
  const normalize = (value: string) =>
    value.toLowerCase().trim().replace(/[_-]+/g, " ");

  // Only accept species present in the 53-species registry.
  const speciesEntry = SPECIES.find(
    (item) => normalize(item.id) === normalize(rawSpecies)
  );

  // Invalid or unknown species must not be displayed.
  const detection = speciesEntry ? candidate : undefined;

  const data = detection as
    | (Detection & Record<string, unknown>)
    | undefined;

  const getText = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = data?.[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    return undefined;
  };

  const imageUrl = getText(
    "image_url",
    "imageUrl",
    "capture_url",
    "photo_url",
    "frame_url",
    "image",
    "thumbnail"
  );

  const species = speciesEntry?.name;

  const timestamp = getText(
    "detected_at",
    "timestamp",
    "created_at"
  );

  const confidenceValue = data?.confidence;

  const confidence =
    typeof confidenceValue === "number"
      ? `${(
          confidenceValue <= 1
            ? confidenceValue * 100
            : confidenceValue
        ).toFixed(2)}%`
      : undefined;

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              detection ? "bg-green-500" : "bg-yellow-500"
            }`}
          />

          <span className="text-sm font-semibold text-white">
            Wildlife Camera
          </span>
        </div>

        <span className="text-xs text-white/60">
          {detection ? "ANIMAL DETECTED" : "STANDBY"}
        </span>
      </div>

      <div className="relative flex aspect-video items-center justify-center bg-zinc-950">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Wildlife detection: ${species}`}
            className="h-full w-full object-contain"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-white/5 p-5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="42"
                height="42"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-white/40"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </div>

            <p className="text-sm font-medium text-white/70">
              Camera on standby
            </p>

            <p className="text-xs text-white/40">
              Waiting for a valid wildlife detection
            </p>
          </div>
        )}

        {demo && (
          <span className="absolute left-3 top-3 rounded bg-amber-500 px-3 py-1 text-xs font-bold text-black">
            DEMO DATA ACTIVE
          </span>
        )}
      </div>

      {detection && species && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-zinc-900 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">
              {species}
            </p>

            <p className="text-xs text-white/50">
              {timestamp
                ? new Date(timestamp).toLocaleString()
                : "Detection received"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {confidence && (
              <span className="text-sm font-semibold text-green-400">
                {confidence}
              </span>
            )}

            {playback && (
              <button
                onClick={onExitPlayback}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/10"
              >
                Exit playback
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
