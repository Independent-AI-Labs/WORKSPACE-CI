import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="hitl-landing">
      <h1 className="text-3xl font-semibold mb-4">HITL Approval</h1>
      <p className="mb-6 text-lg">
        Human-in-the-loop approval surface for credential-release requests.
      </p>
      <Link href="/feed" className="btn btn--primary">
        Open approval feed
      </Link>
    </main>
  )
}
