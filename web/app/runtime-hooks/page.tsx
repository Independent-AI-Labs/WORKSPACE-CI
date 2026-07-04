import { ComingSoon } from '@/components/wiki/ComingSoon'

export default function RuntimeHooksPage() {
  return (
    <ComingSoon
      title="Runtime Hooks"
      description="This page will document runtime hooks that intercept and audit AI agent actions during execution, including file access monitoring, command execution guards, and network call inspection."
      links={[
        { href: '/hooks', label: 'Browse Git Hooks' },
        { href: '/guard', label: 'View Guard Policies' },
      ]}
    />
  )
}
