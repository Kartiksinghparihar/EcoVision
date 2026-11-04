"""Paho MQTT subscriber: validate -> persist -> alert -> broadcast."""
import asyncio
import json
import logging
import os

import paho.mqtt.client as mqtt
from pydantic import ValidationError

from .alerts import alerts_for_detection, alerts_for_status
from .broadcast import hub
from .db import db
from .models import DetectionEvent, SensorEvent, StatusEvent

log = logging.getLogger("ecovision.mqtt")
TOPICS = [("ecovision/+/detection", 1), ("ecovision/+/sensor", 0), ("ecovision/+/status", 1)]


def _camera_id(device_id: str) -> str:
    row = db().table("camera_traps").select("id").eq("device_id", device_id).single().execute()
    return row.data["id"]


def _save_alerts(alerts: list[dict], camera_id: str):
    for a in alerts:
        res = db().table("alerts").insert({**a, "camera_id": camera_id}).execute()
        hub.publish("alert", res.data[0])


def handle(topic: str, payload: bytes):
    kind = topic.rsplit("/", 1)[-1]
    try:
        data = json.loads(payload)
        if kind == "detection":
            e = DetectionEvent(**data)
            cid = _camera_id(e.device_id)
            row = db().table("detections").upsert({
                "camera_id": cid, "species_id": e.species, "confidence": e.confidence,
                "detected_at": e.timestamp.isoformat(), "temperature": e.temperature, "humidity": e.humidity,
                "motion_detected": e.motion_detected, "bbox": e.bbox, "recording_id": e.clip_id,
                "status": "low_confidence" if e.confidence < 0.6 else "confirmed",
            }, on_conflict="camera_id,detected_at,species_id").execute()  # idempotent for offline re-sync
            hub.publish("detection", {**row.data[0], "deviceId": e.device_id})
            _save_alerts(alerts_for_detection(e), cid)
        elif kind == "sensor":
            s = SensorEvent(**data)
            db().table("sensor_readings").insert({"camera_id": _camera_id(s.device_id), "recorded_at": s.timestamp.isoformat(),
                                                   "temperature": s.temperature, "humidity": s.humidity, "motion_detected": s.motion_detected}).execute()
            hub.publish("sensor", s.model_dump(mode="json"))
        elif kind == "status":
            st = StatusEvent(**data)
            cid = _camera_id(st.device_id)
            db().table("camera_status").insert({"camera_id": cid, **st.model_dump(exclude={"device_id"})}).execute()
            hub.publish("camera", st.model_dump())
            _save_alerts(alerts_for_status(st), cid)
    except ValidationError as ve:
        log.warning("Rejected %s: %s", topic, ve.errors())
    except Exception:
        log.exception("Failed to process %s", topic)


def start(loop: asyncio.AbstractEventLoop) -> mqtt.Client:
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="ecovision-api", clean_session=False)
    if os.getenv("MQTT_USERNAME"):
        c.username_pw_set(os.environ["MQTT_USERNAME"], os.environ.get("MQTT_PASSWORD"))
    if os.getenv("MQTT_TLS", "false") == "true":
        c.tls_set()
    c.reconnect_delay_set(min_delay=1, max_delay=60)  # exponential backoff

    def on_connect(client, _u, _f, rc, _p):
        log.info("MQTT connected rc=%s", rc)
        client.subscribe(TOPICS)

    def on_disconnect(_c, _u, _f, rc, _p):
        log.warning("MQTT disconnected rc=%s — paho will reconnect", rc)
        loop.call_soon_threadsafe(hub.publish, "system", {"type": "mqtt_lost", "rc": str(rc)})

    c.on_connect = on_connect
    c.on_disconnect = on_disconnect
    c.on_message = lambda _c, _u, m: loop.run_in_executor(None, handle, m.topic, m.payload)
    c.connect_async(os.getenv("MQTT_HOST", "localhost"), int(os.getenv("MQTT_PORT", "1883")), keepalive=30)
    c.loop_start()
    return c
