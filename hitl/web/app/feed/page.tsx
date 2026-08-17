import { DegradedBanner } from "@/components/DegradedBanner";

export default function FeedPage() {
  return (
    <main className="hitl-feed">
      <h1 className="text-2xl font-semibold mb-4">Approval Feed</h1>
      <DegradedBanner state="unavailable" />
    </main>
  );
}
