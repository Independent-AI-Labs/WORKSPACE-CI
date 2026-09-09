import { RelayStatusBanner } from "@/components/RelayStatusBanner";

export default function FeedPage() {
  return (
    <main className="hitl-feed">
      <h1 className="text-2xl font-semibold mb-4">Approval Feed</h1>
      <RelayStatusBanner state="unavailable" />
    </main>
  );
}
