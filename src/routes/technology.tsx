import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Camera, Cloud, Cpu, Database, Radio, Thermometer, Waves } from "lucide-react";

export const Route = createFileRoute("/technology")({
  head: () => ({
    meta: [
      { title: "Technology — EcoVision" },
      { name: "description", content: "How EcoVision moves from PIR trigger to on-device inference to the live dashboard." },
      { property: "og:title", content: "Technology — EcoVision" },
      { property: "og:description", content: "PIR → camera → TFLite → MQTT → FastAPI → database → live dashboard." },
    ],
  }),
  component: Tech,
});

const STEPS = [
  { icon: Waves, t: "PIR trigger", d: "Passive infrared sensor wakes the pipeline only when warm bodies move — no idle inference." },
  { icon: Camera, t: "Frame capture", d: "USB camera captures a short burst at reduced resolution (320×240, 5 fps) to fit 512 MB RAM." },
  { icon: Cpu, t: "Edge classification", d: "Quantised TensorFlow Lite model labels species and confidence on the Raspberry Pi Zero W." },
  { icon: Thermometer, t: "Sensor fusion", d: "DHT11 temperature and humidity are attached to every event." },
  { icon: Radio, t: "MQTT transport", d: "Metadata (not raw video) is published with QoS 1; events buffer offline and sync on reconnect." },
  { icon: Database, t: "FastAPI + database", d: "Pydantic validation, persistence, alert rules, and SSE fan-out to connected dashboards." },
  { icon: Cloud, t: "Separate video path", d: "Live view runs through an authenticated streaming service, independent of the metadata pipeline." },
];

function Tech() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Home</Link>
      <h1 className="mt-8 font-display text-5xl">From a rustle to a record</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">The EcoVision pipeline is built for a $15 computer running on a battery deep in the forest.</p>
      <ol className="mt-12 space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.t} className="panel rise flex gap-4 p-5" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-neon"><s.icon className="h-5 w-5" /></div>
            <div>
              <div className="font-mono text-xs text-muted-foreground">0{i + 1}</div>
              <h3 className="font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link to="/dashboard" className="mt-10 inline-flex rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Open the dashboard</Link>
    </main>
  );
}
