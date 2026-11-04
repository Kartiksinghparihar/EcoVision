from .models import DetectionEvent, StatusEvent, PRIORITY

LOW_CONFIDENCE = 0.6


def alerts_for_detection(e: DetectionEvent) -> list[dict]:
    out = []
    if e.species in PRIORITY:
        out.append({"type": "priority_species", "severity": "critical" if e.species == "tiger" else "high",
                    "title": f"{e.species.replace('_', ' ').title()} detected",
                    "message": f"{e.device_id} · {round(e.confidence * 100)}% confidence"})
    elif e.confidence < LOW_CONFIDENCE:
        out.append({"type": "low_confidence", "severity": "low", "title": "Low-confidence classification",
                    "message": f"{e.species} at {e.device_id} · {round(e.confidence * 100)}%"})
    else:
        out.append({"type": "animal_detected", "severity": "info", "title": f"{e.species} detected",
                    "message": f"{e.device_id} · {round(e.confidence * 100)}%"})
    return out


def alerts_for_status(s: StatusEvent) -> list[dict]:
    out = []
    if s.state == "offline":
        out.append({"type": "camera_disconnected", "severity": "high", "title": "Camera offline", "message": s.device_id})
    if s.storage_pct and s.storage_pct > 85:
        out.append({"type": "storage_warning", "severity": "medium", "title": f"Storage at {s.storage_pct:.0f}%", "message": s.device_id})
    return out
