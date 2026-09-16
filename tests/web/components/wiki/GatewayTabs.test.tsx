import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GatewayTabs } from "@/components/wiki/GatewayTabs";

vi.mock("@/components/wiki/GrafanaEmbed", () => ({
  GrafanaEmbed: ({ title }: { title: string }) => <div data-testid="embed">{title}</div>,
}));

const dashboards = [
  { title: "Gateway Cost Leaderboard", url: "http://x/d/a/a" },
  { title: "Gateway Cost & Usage", url: "http://x/d/b/b" },
  { title: "Gateway Operations & Health", url: "http://x/d/c/c" },
];

describe("GatewayTabs", () => {
  it("trims an identical leading word from all tab labels", () => {
    render(<GatewayTabs dashboards={dashboards} />);
    expect(screen.getByRole("tab", { name: "Cost Leaderboard" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cost & Usage" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Operations & Health" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Gateway/ })).not.toBeInTheDocument();
  });

  it("keeps the full dashboard title on the embed", () => {
    render(<GatewayTabs dashboards={dashboards} />);
    expect(screen.getByTestId("embed")).toHaveTextContent("Gateway Cost Leaderboard");
  });

  it("leaves labels alone without a shared word prefix", () => {
    const mixed = [
      { title: "Cost Leaderboard", url: "http://x/d/a/a" },
      { title: "Operations", url: "http://x/d/c/c" },
    ];
    render(<GatewayTabs dashboards={mixed} />);
    expect(screen.getByRole("tab", { name: "Cost Leaderboard" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Operations" })).toBeInTheDocument();
  });
});
