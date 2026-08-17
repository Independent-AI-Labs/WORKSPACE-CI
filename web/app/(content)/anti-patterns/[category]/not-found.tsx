import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function PatternCategoryNotFound() {
  return (
    <NotFoundShell
      title="Category not found"
      description="The requested pattern category does not exist."
      backHref="/anti-patterns"
      backLabel="View all anti-patterns"
    />
  )
}
