
"""Multi-model wildlife inference for EcoVision."""

from __future__ import annotations

import io
import logging
import os
import re
from pathlib import Path
from threading import Lock

from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO

log = logging.getLogger("ecovision.inference")

BACKEND_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BACKEND_DIR / "models"


# --------------------------------------------------
# MODEL PATHS
# --------------------------------------------------

TIGER_MODEL_PATH = Path(
    os.getenv(
        "TIGER_MODEL_PATH",
        str(MODELS_DIR / "tiger_best.pt")
    )
).expanduser()

WILDLIFE_MODEL_PATH = Path(
    os.getenv(
        "WILDLIFE_MODEL_PATH",
        str(MODELS_DIR / "best.pt")
    )
).expanduser()


def resolve_path(path: Path) -> Path:
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return path.resolve()


TIGER_MODEL_PATH = resolve_path(TIGER_MODEL_PATH)
WILDLIFE_MODEL_PATH = resolve_path(WILDLIFE_MODEL_PATH)


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

TIGER_CONFIDENCE = float(
    os.getenv("TIGER_CONFIDENCE", "0.40")
)

WILDLIFE_CONFIDENCE = float(
    os.getenv("WILDLIFE_CONFIDENCE", "0.40")
)

IMAGE_SIZE = int(
    os.getenv("INFERENCE_IMAGE_SIZE", "640")
)

MAX_IMAGE_BYTES = int(
    os.getenv(
        "MAX_INFERENCE_IMAGE_BYTES",
        str(10 * 1024 * 1024)
    )
)


# --------------------------------------------------
# MODEL INSTANCES
# --------------------------------------------------

_tiger_model = None
_wildlife_model = None

_model_lock = Lock()


# Classes that must never generate detections.
IGNORED_CLASSES = {
    "harbor",
}


# --------------------------------------------------
# LOAD MODELS
# --------------------------------------------------

def load_models() -> None:
    """Load Tiger and general wildlife models independently."""

    global _tiger_model, _wildlife_model

    with _model_lock:

        _tiger_model = None
        _wildlife_model = None

        # Load dedicated Tiger model
        if TIGER_MODEL_PATH.is_file():
            try:
                _tiger_model = YOLO(str(TIGER_MODEL_PATH))

                log.info(
                    "Tiger specialist model loaded: %s",
                    TIGER_MODEL_PATH
                )

            except Exception:
                log.exception(
                    "Failed to load Tiger specialist model"
                )

        else:
            log.warning(
                "Tiger model not found: %s",
                TIGER_MODEL_PATH
            )

        # Load general wildlife model
        if WILDLIFE_MODEL_PATH.is_file():
            try:
                _wildlife_model = YOLO(
                    str(WILDLIFE_MODEL_PATH)
                )

                log.info(
                    "Wildlife model loaded: %s (%s classes)",
                    WILDLIFE_MODEL_PATH,
                    len(_wildlife_model.names)
                )

            except Exception:
                log.exception(
                    "Failed to load wildlife model"
                )

        else:
            log.warning(
                "Wildlife model not found: %s",
                WILDLIFE_MODEL_PATH
            )

    if not model_ready():
        log.error("No EcoVision inference model is available")


# Backwards compatibility
def load_model() -> None:
    load_models()


# --------------------------------------------------
# MODEL STATUS
# --------------------------------------------------

def tiger_model_ready() -> bool:
    return _tiger_model is not None


def wildlife_model_ready() -> bool:
    return _wildlife_model is not None


def model_ready() -> bool:
    return (
        tiger_model_ready()
        or wildlife_model_ready()
    )


# --------------------------------------------------
# SPECIES NAME NORMALIZATION
# --------------------------------------------------

def _species_slug(label: str) -> str:
    """
    Convert labels such as:
    PolarBear -> polar_bear
    BrownBear -> brown_bear
    RedPanda -> red_panda
    """

    label = re.sub(
        r"([a-z0-9])([A-Z])",
        r"\1_\2",
        label.strip()
    )

    label = re.sub(
        r"[^a-zA-Z0-9]+",
        "_",
        label
    )

    return label.strip("_").lower()


# --------------------------------------------------
# BOUNDING BOX IOU
# --------------------------------------------------

def _iou(a: list[float], b: list[float]) -> float:

    ax, ay, aw, ah = a
    bx, by, bw, bh = b

    left = max(ax, bx)
    top = max(ay, by)

    right = min(ax + aw, bx + bw)
    bottom = min(ay + ah, by + bh)

    intersection = (
        max(0.0, right - left)
        * max(0.0, bottom - top)
    )

    union = (
        aw * ah
        + bw * bh
        - intersection
    )

    return intersection / union if union > 0 else 0.0


# --------------------------------------------------
# RUN INDIVIDUAL MODEL
# --------------------------------------------------

def _run_model(
    model,
    image,
    confidence: float,
    model_name: str,
) -> list[dict]:

    if model is None:
        return []

    results = model.predict(
        source=image,
        conf=confidence,
        imgsz=IMAGE_SIZE,
        verbose=False,
    )

    if not results:
        return []

    result = results[0]

    height, width = result.orig_shape

    detections = []

    if result.boxes is None:
        return detections

    for box in result.boxes:

        class_id = int(box.cls.item())

        label = str(result.names[class_id])

        species = _species_slug(label)

        score = float(box.conf.item())

        # Never allow non-animal classes.
        if species in IGNORED_CLASSES:
            continue

        # --------------------------------------------------
        # STRICT MODEL RESPONSIBILITY
        # --------------------------------------------------

        if model_name == "tiger_specialist":

            # Tiger model is allowed to report Tiger ONLY.
            if species != "tiger":
                continue

        elif model_name == "wildlife":

            # General wildlife model is NOT allowed to
            # report Tiger.
            if species == "tiger":
                continue

        else:
            continue

        # --------------------------------------------------
        # NORMALIZED BOUNDING BOX
        # --------------------------------------------------

        x1, y1, x2, y2 = [
            float(value)
            for value in box.xyxy[0].tolist()
        ]

        bbox = [
            max(0.0, min(1.0, x1 / width)),
            max(0.0, min(1.0, y1 / height)),
            max(
                0.0,
                min(1.0, (x2 - x1) / width)
            ),
            max(
                0.0,
                min(1.0, (y2 - y1) / height)
            ),
        ]

        detections.append({
            "label": label,
            "species": species,
            "confidence": score,
            "bbox": bbox,
            "model": model_name,
        })

    return detections


# --------------------------------------------------
# MERGE DETECTIONS
# --------------------------------------------------

def _merge_predictions(
    predictions: list[dict]
) -> list[dict]:
    """
    Remove duplicate overlapping detections
    of the same species.
    """

    predictions.sort(
        key=lambda item: item["confidence"],
        reverse=True
    )

    kept = []

    for candidate in predictions:

        duplicate = any(
            candidate["species"] == existing["species"]
            and _iou(
                candidate["bbox"],
                existing["bbox"]
            ) >= 0.60
            for existing in kept
        )

        if not duplicate:
            kept.append(candidate)

    return sorted(
        kept,
        key=lambda item: item["confidence"],
        reverse=True
    )


# --------------------------------------------------
# MAIN IMAGE INFERENCE
# --------------------------------------------------

def predict_image(raw: bytes) -> list[dict]:
    """
    Run both models with strict class separation.

    Tiger:
        tiger_best.pt only

    Other wildlife:
        best.pt only
    """

    if not model_ready():
        raise RuntimeError(
            "No inference model is loaded. "
            "Check model paths and startup logs."
        )

    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError(
            f"Image must be between 1 and "
            f"{MAX_IMAGE_BYTES} bytes"
        )

    # Decode image
    try:

        image = Image.open(
            io.BytesIO(raw)
        ).convert("RGB")

    except (
        UnidentifiedImageError,
        OSError
    ) as exc:

        raise ValueError(
            "Uploaded file is not a valid image"
        ) from exc

    predictions = []

    with _model_lock:

        # ------------------------------------------
        # MODEL 1: GENERAL WILDLIFE
        # ------------------------------------------

        wildlife_detections = _run_model(
            model=_wildlife_model,
            image=image,
            confidence=WILDLIFE_CONFIDENCE,
            model_name="wildlife",
        )

        predictions.extend(
            wildlife_detections
        )

        # ------------------------------------------
        # MODEL 2: TIGER SPECIALIST
        # ------------------------------------------

        tiger_detections = _run_model(
            model=_tiger_model,
            image=image,
            confidence=TIGER_CONFIDENCE,
            model_name="tiger_specialist",
        )

        predictions.extend(
            tiger_detections
        )

    final_predictions = _merge_predictions(
        predictions
    )

    log.info(
        "Inference completed: %s detections",
        len(final_predictions)
    )

    return final_predictions
