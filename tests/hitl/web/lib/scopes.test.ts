import { deriveScopes } from '@/lib/scopes'

describe('deriveScopes', () => {
  it('derives scopes from hitl-approvers groups', () => {
    expect(
      deriveScopes([
        'hitl-approvers:production',
        'hitl-approvers:staging',
        'other-group',
      ]),
    ).toEqual(['production', 'staging'])
  })

  it('returns empty for unrelated groups', () => {
    expect(deriveScopes(['other-group'])).toEqual([])
  })

  it('returns empty for no groups', () => {
    expect(deriveScopes([])).toEqual([])
  })
})
