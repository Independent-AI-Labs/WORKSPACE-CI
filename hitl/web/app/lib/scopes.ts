export function deriveScopes(groups: string[]): string[] {
  return groups
    .filter((group) => group.startsWith('hitl-approvers:'))
    .map((group) => group.replace('hitl-approvers:', ''))
}
