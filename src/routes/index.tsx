
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EcoVision — Intelligence for the Wild" },
      {
        name: "description",
        content:
          "AI-powered wildlife camera traps, IoT sensors and live wildlife analytics for conservation teams.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="h-screen w-full overflow-hidden bg-black">
      <iframe
        src="/landing.html"
        title="EcoVision Wildlife Monitoring"
        className="h-full w-full border-0"
        allow="fullscreen"
      />
    </main>
  );
}
