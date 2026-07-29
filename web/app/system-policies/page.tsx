import { ComingSoon } from '@/components/wiki/ComingSoon'

export default function PolicyAutomationPage() {
  return (
    <ComingSoon
      title="System Policies"
      description="This page will document all meta and applied guardrails, including policy invariance and filesystem sandboxing, LLM moderation, agent auditing, file access monitoring, and network call inspection."
      links={[
        { href: '/git-hooks', label: 'Browse Git Hooks' },
        { href: '/sandbox-configs', label: 'View Sandbox Configs' },
      ]}
    />
  )
}
