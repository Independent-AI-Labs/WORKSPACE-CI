import { ComingSoon } from '@/components/wiki/ComingSoon'

export default function EnforcedPoliciesPage() {
  return (
    <ComingSoon
      title="Enforced Policies"
      description="This page will document the runtime policies enforced on AI agent actions during execution, including file access monitoring, command execution guards, and network call inspection."
      links={[
        { href: '/hooks', label: 'Browse Git Hooks' },
        { href: '/guard', label: 'View Guard Policies' },
      ]}
    />
  )
}
