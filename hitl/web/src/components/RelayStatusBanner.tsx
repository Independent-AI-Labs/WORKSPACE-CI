"use client";

export function RelayStatusBanner({
  state,
}: {
  state: "healthy" | "restricted" | "disconnected" | "unavailable";
}) {
  if (state === "healthy") return null;

  return (
    <div className="relay-status-banner" role="status" aria-live="polite">
      {state === "restricted"
        ? "Relay is restricted; decisions are disabled."
        : state === "unavailable"
          ? "HITL authentication and relay access are unavailable."
          : "Disconnected; reconnecting…"}
    </div>
  );
}
