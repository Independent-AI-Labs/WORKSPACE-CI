"use client";

export function DegradedBanner({
  state,
}: {
  state: "healthy" | "degraded" | "disconnected" | "unavailable";
}) {
  if (state === "healthy") return null;

  return (
    <div className="degraded-banner" role="status" aria-live="polite">
      {state === "degraded"
        ? "Relay is degraded; decisions are disabled."
        : state === "unavailable"
          ? "HITL authentication and relay access are unavailable."
          : "Disconnected; reconnecting…"}
    </div>
  );
}
