import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  void request;
  return NextResponse.json(
    { error: "HITL authentication is not configured" },
    { status: 503 },
  );
}

export const config = {
  matcher: ["/feed/:path*", "/api/hitl/:path*"],
};
