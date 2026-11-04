# EcoVision — Setup Guide

```
.
├── src/                  Web dashboard (TanStack Start + React + TS + Tailwind, Recharts, Leaflet)
│   ├── routes/           /, /login, /technology, /dashboard/* pages
│   ├── components/eco/   Camera feed, map, shared UI
│   └── lib/ecovision/    Types, demo data, live store (SSE), sun calc, auth stub
├── backend/              FastAPI + Paho MQTT + Supabase
│   ├── app/              main.py (REST + SSE), mqtt_client.py, models.py, alerts.py
│   └── database/schema.sql
└── edge/ecovision_edge.py  Raspberry Pi agent (PIR → OpenCV → TFLite → MQTT, offline buffer)
```

> Note: the web app uses TanStack Start (React/TypeScript) instead of Next.js — same React component model, routing is file-based under `src/routes`.

## Stage 1 — Run the dashboard in demo mode (Windows / VS Code)
```powershell
winget install OpenJS.NodeJS.LTS
npm install -g bun
bun install
bun run dev          # http://localhost:8080
```
With `VITE_ECOVISION_API_URL` empty, the app uses a clearly labelled synthetic dataset and a simulated event stream.

## Stage 2 — Database
1. Create a Supabase project, open the SQL editor, run `backend/database/schema.sql`.
2. Insert your camera: `insert into camera_traps(device_id,name,latitude,longitude) values ('ecovision-001','Ridge Trail',21.7167,80.6122);`

## Stage 3 — MQTT broker + API
```powershell
winget install EclipseFoundation.Mosquitto
cd backend
py -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env    # fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MQTT_*
uvicorn app.main:app --reload --port 8000
```
Test without hardware:
```powershell
mosquitto_pub -t ecovision/ecovision-001/detection -q 1 -m '{"device_id":"ecovision-001","species":"tiger","confidence":0.94,"timestamp":"2026-10-20T10:30:00Z","temperature":28.5,"humidity":67,"motion_detected":true}'
```

## Stage 4 — Connect the dashboard
Set `VITE_ECOVISION_API_URL=http://localhost:8000` in `.env`, restart `bun run dev`. Replace `src/lib/ecovision/auth.ts` with Supabase Auth and send the access token as `Authorization: Bearer` to the API.

## Stage 5 — Raspberry Pi Zero W
```bash
sudo apt update && sudo apt install -y python3-pip python3-opencv libatlas-base-dev libgpiod2
pip3 install tflite-runtime paho-mqtt adafruit-circuitpython-dht RPi.GPIO
export DEVICE_ID=ecovision-001 MQTT_HOST=<broker> MQTT_USERNAME=... MQTT_PASSWORD=...
python3 edge/ecovision_edge.py
```
Wiring: PIR OUT → GPIO17, DHT11 DATA → GPIO4 (10 kΩ pull-up), USB camera via OTG. Use an int8-quantised MobileNet-class model (<5 MB). Run as a systemd service for auto-restart.

## Performance & reliability
- Inference only after PIR triggers, ~5 frames at 320×240; false triggers deleted locally.
- Only metadata over MQTT (QoS 1, persistent session, last-will = offline). Events buffer in SQLite and re-sync; the API upserts idempotently.
- Live video is a separate authenticated stream (e.g. MediaMTX/WebRTC) referenced by `camera_traps.stream_url`.
- Secrets (MQTT, service role key) live only on the server/device — never in `VITE_*` variables.
