"""
EcoVision edge agent for Raspberry Pi Zero W (512 MB).
PIR-triggered capture -> TFLite classification -> MQTT publish, with offline SQLite buffer.

  sudo apt install python3-opencv libatlas-base-dev
  pip install tflite-runtime paho-mqtt adafruit-circuitpython-dht RPi.GPIO
"""
import json, os, sqlite3, time, uuid
from datetime import datetime, timezone

import cv2
import numpy as np
import paho.mqtt.client as mqtt
import RPi.GPIO as GPIO
from tflite_runtime.interpreter import Interpreter

DEVICE_ID = os.getenv("DEVICE_ID", "ecovision-001")
PIR_PIN = int(os.getenv("PIR_PIN", "17"))
DHT_PIN = os.getenv("DHT_PIN", "D4")
MODEL = os.getenv("MODEL_PATH", "model/wildlife_int8.tflite")
LABELS = open(os.getenv("LABELS_PATH", "model/labels.txt")).read().split()
MIN_CONF = float(os.getenv("MIN_CONFIDENCE", "0.6"))
COOLDOWN = int(os.getenv("PIR_COOLDOWN_S", "30"))
FRAMES = int(os.getenv("FRAMES_PER_TRIGGER", "5"))
W, H = 320, 240  # low resolution keeps RAM/CPU in budget

# --- offline buffer -----------------------------------------------------------
buf = sqlite3.connect("buffer.db", check_same_thread=False)
buf.execute("create table if not exists q (id integer primary key, topic text, payload text)")

def enqueue(topic, payload):
    buf.execute("insert into q(topic,payload) values(?,?)", (topic, json.dumps(payload))); buf.commit()

def flush(client):
    for rid, topic, payload in buf.execute("select id,topic,payload from q order by id limit 200").fetchall():
        if client.publish(topic, payload, qos=1).rc == mqtt.MQTT_ERR_SUCCESS:
            buf.execute("delete from q where id=?", (rid,))
    buf.commit()

# --- MQTT ------------------------------------------------------------------------
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=DEVICE_ID, clean_session=False)
client.username_pw_set(os.environ["MQTT_USERNAME"], os.environ["MQTT_PASSWORD"])
client.will_set(f"ecovision/{DEVICE_ID}/status", json.dumps({"device_id": DEVICE_ID, "state": "offline"}), qos=1, retain=True)
client.reconnect_delay_set(1, 120)
client.on_connect = lambda c, *_: (flush(c), status("idle"))
client.connect_async(os.getenv("MQTT_HOST", "broker.local"), int(os.getenv("MQTT_PORT", "1883")), keepalive=60)
client.loop_start()

def publish(kind, payload):
    topic = f"ecovision/{DEVICE_ID}/{kind}"
    if not client.is_connected() or client.publish(topic, json.dumps(payload), qos=1).rc != 0:
        enqueue(topic, payload)

def status(state):
    st = os.statvfs("/")
    publish("status", {"device_id": DEVICE_ID, "state": state,
                       "storage_pct": round(100 * (1 - st.f_bavail / st.f_blocks), 1),
                       "buffered_events": buf.execute("select count(*) from q").fetchone()[0]})

# --- sensors ---------------------------------------------------------------------
GPIO.setmode(GPIO.BCM); GPIO.setup(PIR_PIN, GPIO.IN)
try:
    import adafruit_dht, board
    dht = adafruit_dht.DHT11(getattr(board, DHT_PIN))
except Exception:
    dht = None

def read_dht():
    for _ in range(3):
        try: return dht.temperature, dht.humidity
        except Exception: time.sleep(1)
    return None, None  # reported as a read failure

# --- model -----------------------------------------------------------------------
interp = Interpreter(MODEL, num_threads=1); interp.allocate_tensors()
inp, out = interp.get_input_details()[0], interp.get_output_details()[0]
IH, IW = inp["shape"][1:3]

def classify(frame):
    x = cv2.resize(frame, (IW, IH))[..., ::-1]
    x = np.expand_dims(x, 0).astype(inp["dtype"])
    interp.set_tensor(inp["index"], x); interp.invoke()
    y = interp.get_tensor(out["index"])[0].astype(np.float32)
    if out["dtype"] == np.uint8:
        s, z = out["quantization"]; y = (y - z) * s
    i = int(np.argmax(y)); return LABELS[i], float(y[i])

def on_motion():
    status("recording")
    cam = cv2.VideoCapture(0); cam.set(cv2.CAP_PROP_FRAME_WIDTH, W); cam.set(cv2.CAP_PROP_FRAME_HEIGHT, H)
    best = ("unknown", 0.0); clip_id = uuid.uuid4().hex[:12]
    os.makedirs("clips", exist_ok=True)
    writer = cv2.VideoWriter(f"clips/{clip_id}.avi", cv2.VideoWriter_fourcc(*"MJPG"), 5, (W, H))
    for _ in range(FRAMES * 4):
        ok, frame = cam.read()
        if not ok: break
        writer.write(frame)
    cam.release(); writer.release()
    cap = cv2.VideoCapture(f"clips/{clip_id}.avi")
    for _ in range(FRAMES):  # only classify a few frames
        ok, f = cap.read()
        if not ok: break
        r = classify(f); best = r if r[1] > best[1] else best
        for _ in range(3): cap.read()
    cap.release()
    t, h = read_dht()
    if best[1] >= MIN_CONF * 0.8:  # publish low-confidence too; backend flags them
        publish("detection", {"device_id": DEVICE_ID, "species": best[0], "confidence": round(best[1], 3),
                              "timestamp": datetime.now(timezone.utc).isoformat(), "temperature": t, "humidity": h,
                              "motion_detected": True, "clip_id": clip_id})
    else:
        os.remove(f"clips/{clip_id}.avi")  # false trigger — discard
    status("idle")

last_trigger, last_sensor = 0, 0
print(f"EcoVision edge {DEVICE_ID} running")
while True:
    now = time.time()
    if GPIO.input(PIR_PIN) and now - last_trigger > COOLDOWN:
        last_trigger = now; on_motion()
    if now - last_sensor > 900:
        last_sensor = now; t, h = read_dht()
        publish("sensor", {"device_id": DEVICE_ID, "timestamp": datetime.now(timezone.utc).isoformat(),
                           "temperature": t, "humidity": h, "motion_detected": bool(GPIO.input(PIR_PIN))})
        if client.is_connected(): flush(client)
    time.sleep(0.2)
