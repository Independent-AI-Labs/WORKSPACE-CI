import { FeedList } from '@/components/FeedList'
import { DegradedBanner } from '@/components/DegradedBanner'

export default function FeedPage() {
  const items = [
    {
      id: 'req-1',
      principal: 'agent/ci-01',
      host: 'build-01.internal',
      action: { display: 'Release production signing key' },
      scope: 'production',
      tier: 1 as const,
      justification:
        'Deployment pipeline requires credential release for release-2026-07-25.',
      requestHash:
        'sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      createdAt: '2026-07-25T20:00:00.000Z',
      expiresAt: '2026-07-25T20:05:00.000Z',
    },
  ]

  return (
    <main className="hitl-feed">
      <h1 className="text-2xl font-semibold mb-4">Approval Feed</h1>
      <DegradedBanner state="healthy" />
      <FeedList items={items} />
    </main>
  )
}
