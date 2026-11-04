
import asyncio
import os
from uuid import uuid4

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Request,
    UploadFile,
    File,
    Form,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

load_dotenv()

from . import mqtt_client
from . import inference
from .broadcast import hub
from .db import db
from .alerts import alerts_for_detection
from .models import DetectionEvent


HEARTBEAT_TIMEOUT_SECONDS = int(
    os.getenv("CAMERA_HEARTBEAT_TIMEOUT_SECONDS", "180")
)

# Supabase Storage configuration
STORAGE_BUCKET = os.getenv(
    "SUPABASE_STORAGE_BUCKET",
    "wildlife-captures",
)

SIGNED_URL_EXPIRY = 3600


# --------------------------------------------------
# APPLICATION LIFESPAN
# --------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize AI models and MQTT."""

    inference.load_models()

    print(
        "TIGER MODEL STATUS:",
        "LOADED" if inference.tiger_model_ready() else "NOT LOADED",
    )

    print(
        "WILDLIFE MODEL STATUS:",
        "LOADED" if inference.wildlife_model_ready() else "NOT LOADED",
    )

    print(
        "INFERENCE STATUS:",
        "READY" if inference.model_ready() else "UNAVAILABLE",
    )

    client = mqtt_client.start(asyncio.get_running_loop())

    try:
        yield
    finally:
        client.loop_stop()
        client.disconnect()


# --------------------------------------------------
# FASTAPI APPLICATION
# --------------------------------------------------

app = FastAPI(
    title="EcoVision API",
    version="1.4.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        "http://localhost:8080",
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# AUTHENTICATION
# --------------------------------------------------

def require_user(
    authorization: str | None = Header(default=None),
):
    """Validate Supabase access token."""

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")

    user = db().auth.get_user(
        authorization.removeprefix("Bearer ")
    )

    if not user or not user.user:
        raise HTTPException(401, "Invalid token")

    return user.user


def require_edge_key(
    x_device_key: str | None = Header(default=None),
):
    expected = os.getenv("EDGE_API_KEY")

    if not expected:
        raise HTTPException(
            503,
            "Edge inference upload is not configured: set EDGE_API_KEY",
        )

    if not x_device_key or x_device_key != expected:
        raise HTTPException(401, "Invalid device key")


# --------------------------------------------------
# DATE AND TIME HELPERS
# --------------------------------------------------

def utc_datetime(value: Any) -> datetime | None:
    """Parse a database timestamp."""

    if not value:
        return None

    if isinstance(value, datetime):
        result = value
    else:
        try:
            result = datetime.fromisoformat(
                str(value).replace("Z", "+00:00")
            )
        except (TypeError, ValueError):
            return None

    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)

    return result.astimezone(timezone.utc)


def iso_or_none(value: Any) -> str | None:
    parsed = utc_datetime(value)
    return parsed.isoformat() if parsed else None


# --------------------------------------------------
# SUPABASE STORAGE
# --------------------------------------------------

def upload_capture(
    raw: bytes,
    device_id: str,
    content_type: str,
    captured_at: datetime,
) -> str:
    """Upload captured image to private Supabase Storage."""

    extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }

    extension = extensions.get(content_type)

    if not extension:
        raise ValueError("Unsupported image content type")

    safe_device_id = "".join(
        char
        for char in device_id
        if char.isalnum() or char in "-_"
    )

    if not safe_device_id:
        raise ValueError("Invalid camera device ID")

    filename = (
        f"{captured_at.strftime('%Y%m%d_%H%M%S_%f')}_"
        f"{uuid4().hex}.{extension}"
    )

    storage_path = f"{safe_device_id}/{filename}"

    result = (
        db()
        .storage
        .from_(STORAGE_BUCKET)
        .upload(
            storage_path,
            raw,
            file_options={
                "content-type": content_type,
                "upsert": "false",
            },
        )
    )

    print("[STORAGE] Image uploaded:", storage_path)

    return storage_path


def signed_capture_url(
    storage_path: str | None,
) -> str | None:
    """Generate a temporary URL for a private Storage image."""

    if not storage_path:
        return None

    try:
        result = (
            db()
            .storage
            .from_(STORAGE_BUCKET)
            .create_signed_url(
                storage_path,
                SIGNED_URL_EXPIRY,
            )
        )

        if isinstance(result, dict):
            return (
                result.get("signedURL")
                or result.get("signedUrl")
            )

        return (
            getattr(result, "signedURL", None)
            or getattr(result, "signedUrl", None)
        )

    except Exception as error:
        print(
            "[STORAGE] Signed URL generation failed:",
            error,
        )
        return None


# --------------------------------------------------
# DATABASE NORMALIZATION
# --------------------------------------------------

def related_camera(row: dict) -> dict:
    """Supabase relationships can be object or list."""

    value = row.get("camera_traps")

    if isinstance(value, list):
        return value[0] if value else {}

    return value if isinstance(value, dict) else {}


def severity_for_detection(
    species: str,
    confidence: float,
) -> str:

    if confidence < 0.6:
        return "low"

    if species in {"tiger", "leopard", "dhole"}:
        return "critical"

    return "medium"


def normalize_camera(row: dict) -> dict:
    last_seen = utc_datetime(row.get("last_seen"))
    now = datetime.now(timezone.utc)

    is_fresh = (
        last_seen is not None
        and (now - last_seen).total_seconds()
        <= HEARTBEAT_TIMEOUT_SECONDS
    )

    reported_state = row.get("state")

    state = (
        reported_state
        if is_fresh and reported_state
        else "offline"
    )

    return {
        "id": row.get("id"),
        "deviceId": row.get("device_id"),
        "name": row.get("name"),
        "lat": row.get("latitude"),
        "lng": row.get("longitude"),
        "state": state,
        "battery": row.get("battery"),
        "signal": row.get("signal"),
        "storagePct": row.get("storage_pct"),
        "firmware": row.get("firmware"),
        "lastSeen": iso_or_none(row.get("last_seen")),
        "streamUrl": row.get("stream_url"),
        "active": row.get("active"),
        "timezone": row.get("timezone"),
    }


def normalize_detection(row: dict) -> dict:
    camera = related_camera(row)

    species = row.get("species_id") or "unknown"
    confidence = float(row.get("confidence") or 0)

    bbox = row.get("bbox")

    if (
        not isinstance(bbox, list)
        or len(bbox) != 4
    ):
        bbox = None

    return {
        "id": str(row.get("id")),
        "species": species,
        "confidence": confidence,
        "timestamp": iso_or_none(row.get("detected_at")),
        "deviceId": camera.get("device_id") or "",
        "temperature": row.get("temperature"),
        "humidity": row.get("humidity"),
        "motion": row.get("motion_detected"),
        "status": row.get("status") or "pending",
        "severity": severity_for_detection(
            species,
            confidence,
        ),
        "bbox": bbox,
        "thumbnail": signed_capture_url(
            row.get("image_path")
        ),
    }


def normalize_sensor(row: dict) -> dict:
    camera = related_camera(row)

    return {
        "timestamp": iso_or_none(row.get("recorded_at")),
        "deviceId": camera.get("device_id") or "",
        "temperature": row.get("temperature"),
        "humidity": row.get("humidity"),
        "motion": row.get("motion_detected"),
    }


def normalize_alert(row: dict) -> dict:
    camera = related_camera(row)

    return {
        "id": str(row.get("id")),
        "type": row.get("type") or "animal_detected",
        "severity": row.get("severity") or "info",
        "title": row.get("title") or "EcoVision alert",
        "message": row.get("message") or "",
        "timestamp": iso_or_none(row.get("created_at")),
        "deviceId": camera.get("device_id") or "",
        "read": bool(row.get("read", False)),
    }


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.get("/health")
def health():
    return {
        "ok": True,
        "time": datetime.now(timezone.utc).isoformat(),
        "tiger_model_loaded": inference.tiger_model_ready(),
        "wildlife_model_loaded": inference.wildlife_model_ready(),
        "inference_ready": inference.model_ready(),
    }


# --------------------------------------------------
# MULTI-MODEL PIR IMAGE INFERENCE
# --------------------------------------------------

@app.post("/api/inference/{device_id}")
async def tiger_inference(
    device_id: str,
    file: UploadFile = File(...),
    timestamp: datetime | None = Form(default=None),
    temperature: float | None = Form(default=None),
    humidity: float | None = Form(default=None),
    _=Depends(require_edge_key),
):
    """
    Receive PIR-triggered image.
    Run both AI models.
    Upload captured image to private Supabase Storage.
    Save the highest-confidence detection.
    """

    if not inference.model_ready():
        raise HTTPException(
            503,
            "No AI inference model is available. Check backend logs.",
        )

    if file.content_type not in {
        "image/jpeg",
        "image/png",
        "image/webp",
    }:
        raise HTTPException(
            415,
            "Upload a JPEG, PNG, or WEBP image",
        )

    raw = await file.read(
        inference.MAX_IMAGE_BYTES + 1
    )

    if len(raw) > inference.MAX_IMAGE_BYTES:
        raise HTTPException(
            413,
            "Image exceeds the configured upload limit",
        )

    try:
        predictions = await run_in_threadpool(
            inference.predict_image,
            raw,
        )

    except ValueError as exc:
        raise HTTPException(
            400,
            str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            503,
            str(exc),
        ) from exc

    captured_at = (
        timestamp
        or datetime.now(timezone.utc)
    )

    if captured_at.tzinfo is None:
        captured_at = captured_at.replace(
            tzinfo=timezone.utc
        )

    captured_at = captured_at.astimezone(
        timezone.utc
    )

    response = {
        "device_id": device_id,
        "status": (
            "detected"
            if predictions
            else "no_detection"
        ),
        "detections": predictions,
        "detected_at": captured_at.isoformat(),
    }

    if not predictions:
        return response

    best = predictions[0]

    camera_result = (
        db()
        .table("camera_traps")
        .select("id")
        .eq("device_id", device_id)
        .limit(1)
        .execute()
    )

    if not camera_result.data:
        raise HTTPException(
            404,
            f"Unknown camera device_id: {device_id}",
        )

    camera_id = camera_result.data[0]["id"]

    event = DetectionEvent(
        device_id=device_id,
        species=best["species"],
        confidence=best["confidence"],
        timestamp=captured_at,
        temperature=temperature,
        humidity=humidity,
        motion_detected=True,
        bbox=best.get("bbox"),
    )

    # Upload the original captured image.
    try:
        image_path = await run_in_threadpool(
            upload_capture,
            raw,
            device_id,
            file.content_type,
            captured_at,
        )

    except Exception as exc:
        print("[STORAGE] Upload failed:", exc)

        raise HTTPException(
            500,
            "Unable to upload captured image to Supabase Storage",
        ) from exc

    # Save detection and image path.
    try:
        saved_result = (
            db()
            .table("detections")
            .upsert(
                {
                    "camera_id": camera_id,
                    "species_id": event.species,
                    "confidence": event.confidence,
                    "detected_at": event.timestamp.isoformat(),
                    "temperature": event.temperature,
                    "humidity": event.humidity,
                    "motion_detected": True,
                    "bbox": event.bbox,
                    "image_path": image_path,
                    "status": (
                        "low_confidence"
                        if event.confidence < 0.6
                        else "confirmed"
                    ),
                },
                on_conflict=(
                    "camera_id,detected_at,species_id"
                ),
            )
            .execute()
        )

    except Exception as exc:
        print("[DATABASE] Detection save failed:", exc)

        # Remove the newly uploaded object if the database
        # operation fails, avoiding an orphaned image.
        try:
            db().storage.from_(STORAGE_BUCKET).remove(
                [image_path]
            )
        except Exception as cleanup_error:
            print(
                "[STORAGE] Cleanup failed:",
                cleanup_error,
            )

        raise HTTPException(
            500,
            "Unable to save detection to database",
        ) from exc

    if not saved_result.data:
        raise HTTPException(
            500,
            "Detection was not returned by the database",
        )

    saved = saved_result.data[0]

    # Publish normalized event with signed thumbnail URL.
    live_detection = normalize_detection({
        **saved,
        "camera_traps": {
            "device_id": device_id,
        },
    })

    hub.publish(
        "detection",
        live_detection,
    )

    # Create and publish alerts.
    for alert in alerts_for_detection(event):
        created = (
            db()
            .table("alerts")
            .insert(
                {
                    **alert,
                    "camera_id": camera_id,
                }
            )
            .execute()
        )

        if created.data:
            hub.publish(
                "alert",
                {
                    **created.data[0],
                    "camera_traps": {
                        "device_id": device_id,
                    },
                },
            )

    response["saved_detection"] = saved
    response["thumbnail"] = live_detection["thumbnail"]

    return response


# --------------------------------------------------
# CAMERA API
# --------------------------------------------------

@app.get("/api/cameras")
def cameras(_=Depends(require_user)):

    rows = (
        db()
        .table("camera_traps_with_status")
        .select("*")
        .execute()
        .data
    )

    return [
        normalize_camera(row)
        for row in rows
    ]


# --------------------------------------------------
# DETECTION API
# --------------------------------------------------

@app.get("/api/detections")
def detections(
    limit: int = 500,
    species: str | None = None,
    camera_id: str | None = None,
    since: datetime | None = None,
    _=Depends(require_user),
):

    q = (
        db()
        .table("detections")
        .select("*, camera_traps(device_id)")
        .order("detected_at", desc=True)
        .limit(min(max(limit, 1), 5000))
    )

    if species:
        q = q.eq("species_id", species)

    if camera_id:
        q = q.eq("camera_id", camera_id)

    if since:
        q = q.gte(
            "detected_at",
            since.isoformat(),
        )

    return [
        normalize_detection(row)
        for row in q.execute().data
    ]


# --------------------------------------------------
# SENSOR API
# --------------------------------------------------

@app.get("/api/sensors")
def sensors(
    hours: int = 72,
    camera_id: str | None = None,
    _=Depends(require_user),
):

    safe_hours = min(max(hours, 1), 8760)

    since = (
        datetime.now(timezone.utc)
        - timedelta(hours=safe_hours)
    )

    q = (
        db()
        .table("sensor_readings")
        .select("*, camera_traps(device_id)")
        .gte(
            "recorded_at",
            since.isoformat(),
        )
        .order("recorded_at")
    )

    if camera_id:
        q = q.eq("camera_id", camera_id)

    return [
        normalize_sensor(row)
        for row in q.execute().data
    ]


# --------------------------------------------------
# ALERT API
# --------------------------------------------------

@app.get("/api/alerts")
def alerts(
    unread: bool | None = None,
    _=Depends(require_user),
):

    q = (
        db()
        .table("alerts")
        .select("*, camera_traps(device_id)")
        .order("created_at", desc=True)
        .limit(500)
    )

    if unread is not None:
        q = q.eq("read", not unread)

    return [
        normalize_alert(row)
        for row in q.execute().data
    ]


@app.patch("/api/alerts/{alert_id}")
def mark_alert(
    alert_id: str,
    read: bool = True,
    _=Depends(require_user),
):

    result = (
        db()
        .table("alerts")
        .update({"read": read})
        .eq("id", alert_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            404,
            "Alert not found",
        )

    return result.data[0]


# --------------------------------------------------
# ANALYTICS API
# --------------------------------------------------

@app.get("/api/analytics/summary")
def summary(
    days: int = 30,
    _=Depends(require_user),
):

    safe_days = min(max(days, 1), 3650)

    return (
        db()
        .rpc(
            "detection_summary",
            {"days": safe_days},
        )
        .execute()
        .data
    )


# --------------------------------------------------
# SERVER-SENT EVENTS
# --------------------------------------------------

@app.get("/api/events/stream")
async def stream(request: Request):
    """SSE: detection / sensor / camera / alert / system."""

    q = hub.subscribe()

    async def gen():

        try:
            yield "retry: 3000\n\n"

            while not await request.is_disconnected():

                try:
                    yield await asyncio.wait_for(
                        q.get(),
                        timeout=15,
                    )

                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"

        finally:
            hub.unsubscribe(q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
