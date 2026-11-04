

export type SpeciesId =
  | "tiger"
  | "zebra"
  | "lion"
  | "leopard"
  | "cheetah"
  | "bear"
  | "butterfly"
  | "canary"
  | "crocodile"
  | "bull"
  | "camel"
  | "centipede"
  | "caterpillar"
  | "duck"
  | "squirrel"
  | "spider"
  | "ladybug"
  | "elephant"
  | "horse"
  | "fox"
  | "tortoise"
  | "frog"
  | "kangaroo"
  | "deer"
  | "eagle"
  | "monkey"
  | "snake"
  | "owl"
  | "swan"
  | "goat"
  | "rabbit"
  | "giraffe"
  | "goose"
  | "polar_bear"
  | "raven"
  | "hippopotamus"
  | "brown_bear"
  | "rhinoceros"
  | "woodpecker"
  | "sheep"
  | "magpie"
  | "ostrich"
  | "jaguar"
  | "hedgehog"
  | "turkey"
  | "raccoon"
  | "worm"
  | "panda"
  | "red_panda"
  | "otter"
  | "lynx"
  | "scorpion"
  | "koala";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type CameraState = "offline" | "idle" | "recording" | "live";

export interface Species {
  id: SpeciesId;
  name: string;
  scientific: string;
  icon: string;
  priority: boolean;
  color: string;
}

export interface CameraTrap {
  id: string;
  deviceId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  state: CameraState;
  battery: number | null;
  signal: number | null;
  storagePct?: number | null;
  firmware: string | null;
  lastSeen: string | null;
  streamUrl?: string | null;
  active?: boolean;
  timezone?: string | null;
}

export interface Detection {
  id: string;
  species: SpeciesId;
  confidence: number;
  timestamp: string;
  deviceId: string;
  temperature: number | null;
  humidity: number | null;
  motion: boolean | null;
  status: "confirmed" | "pending" | "low_confidence";
  severity: Severity;
  bbox?: [number, number, number, number];
  thumbnail?: string | null;
}

export interface SensorReading {
  timestamp: string;
  deviceId: string;
  temperature: number | null;
  humidity: number | null;
  motion: boolean | null;
}

export type AlertType =
  | "animal_detected"
  | "priority_species"
  | "camera_disconnected"
  | "sensor_malfunction"
  | "mqtt_lost"
  | "storage_warning"
  | "low_confidence"
  | "unusual_frequency";

export interface Alert {
  id: string;
  type: AlertType;
  severity: Severity;
  title: string;
  message: string;
  timestamp: string;
  deviceId?: string;
  read: boolean;
}
