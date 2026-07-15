import Link from 'next/link'
import type { Branding } from '@/lib/branding'
import { ThemeLogo } from './ThemeLogo'

interface WikiHeaderBrandProps {
  branding: Branding
  homeLandingEnabled: boolean
}

export function WikiHeaderBrand({ branding, homeLandingEnabled }: WikiHeaderBrandProps) {
  const brandHref = homeLandingEnabled ? '/' : '/projects'
  const brandTitle = homeLandingEnabled ? 'Home' : 'Projects'

  return (
    <Link href={brandHref} className="wiki-header__brand" title={brandTitle}>
      <ThemeLogo
        src={branding.logo_path}
        srcDark={branding.logo_path_dark}
        srcLight={branding.logo_path_light}
        className="wiki-header__brand-logo"
        alt={`${branding.sidebar_title_thin}${branding.sidebar_title_bold} logo`}
        colorVar="var(--text)"
      />
    </Link>
  )
}