import { render, screen } from "@testing-library/react";
import { FeedList } from "@/components/FeedList";

describe("FeedList", () => {
  it("links to review without rendering decision controls", () => {
    render(
      <FeedList
        items={[
          {
            id: "request-1",
            principal: "agent:ci",
            host: "dev-vm-01",
            action: { display: "Restart workspace-ci-wiki" },
            scope: "operations",
            tier: 1,
            justification: "Deploy completed",
            requestHash: "sha256:1234567890abcdef",
            createdAt: "2026-08-16T00:00:00Z",
            expiresAt: "2026-08-16T00:15:00Z",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Review request" }),
    ).toHaveAttribute("href", "/feed/request-1");
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deny" }),
    ).not.toBeInTheDocument();
  });
});
