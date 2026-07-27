/**
 * Resolver injected into the packaged ContentRenderer so wiki README images
 * are served through the local project-asset endpoint.
 *
 * Lives in web/src because the `/api/project-asset` route is wiki-domain.
 */
export function resolveWikiProjectAsset(projectSlug: string, path: string): string {
  return `/api/project-asset?project=${encodeURIComponent(projectSlug)}&path=${encodeURIComponent(path)}`
}
