import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import { getLandingPostsConfig } from '@/lib/landing-posts'
import { PROJECTS } from '@/lib/project-registry'
import { ThemeLogo } from '@/components/wiki/ThemeLogo'

export function HomeLanding() {
  const config = getLandingPostsConfig()
  if (!config) {
    return (
      <p className="page-intro">
        Home landing is enabled but content is missing. Clone{' '}
        <code>WORKSPACE-WEB-CONTENT</code> and run <code>node scripts/sync-web-content.mjs</code>.
      </p>
    )
  }

  const projectBySlug = new Map(PROJECTS.map((p) => [p.slug, p]))

  return (
    <div className="landing-page">
      <header className="landing-mission">
        <h1 className="landing-mission__headline">{config.mission.headline}</h1>
        <p className="landing-mission__summary">{config.mission.summary}</p>
        <ul className="landing-mission__products">
          {config.mission.products.map((product) => {
            const meta = projectBySlug.get(product.slug)
            return (
              <li key={product.slug} className="landing-mission__product">
                {meta?.logoPath ? (
                  <ThemeLogo
                    src={meta.logoPath}
                    className="landing-mission__product-logo"
                    alt=""
                    colorVar="var(--text)"
                  />
                ) : (
                  <i className={meta?.icon ?? 'ri-code-box-line'} aria-hidden="true" />
                )}
                <span className="landing-mission__product-name">
                  {meta?.displayName ?? product.slug}
                </span>
                <span className="landing-mission__product-blurb">{product.blurb}</span>
              </li>
            )
          })}
        </ul>
      </header>

      <RotatingPosts posts={config.posts} settings={config.settings} />
    </div>
  )
}