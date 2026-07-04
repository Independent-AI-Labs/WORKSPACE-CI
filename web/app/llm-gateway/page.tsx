import { ComingSoon } from '@/components/wiki/ComingSoon'

export default function LLMGatewayPage() {
  return (
    <ComingSoon
      title="LLM Gateway"
      description="This page will provide a gateway for routing, auditing, and governing LLM API calls, including token budgeting, model allowlists, and prompt logging."
      links={[
        { href: '/standards', label: 'Browse Standards & Regulations' },
        { href: '/integration', label: 'View Integration Guide' },
      ]}
    />
  )
}
