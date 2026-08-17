"use client";

import { RequestSummary } from "@/types/request";
import { EvidencePack } from "./EvidencePack";
import Link from "next/link";

export function FeedList({ items }: { items: RequestSummary[] }) {
  if (items.length === 0) {
    return <p className="hitl-empty">No pending requests.</p>;
  }

  return (
    <ul className="hitl-feed-list" role="list">
      {items.map((item) => (
        <li key={item.id} className="hitl-feed-item">
          <EvidencePack request={item} />
          <Link
            href={`/feed/${encodeURIComponent(item.id)}`}
            className="btn btn--primary"
          >
            Review request
          </Link>
        </li>
      ))}
    </ul>
  );
}
