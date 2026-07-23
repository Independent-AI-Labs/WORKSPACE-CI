import { ComingSoon } from '@/components/wiki/ComingSoon'

export default function ChecksPage() {
  return (
    <ComingSoon
      title="Static Analysis"
      description="This page will run CI checks directly in your browser. Upload a source archive or point to a Git repository to get started."
      links={[
        { href: '/anti-patterns', label: 'Browse Anti-Patterns' },
        { href: '/config', label: 'View Config Files' },
      ]}
    />
  )
}
