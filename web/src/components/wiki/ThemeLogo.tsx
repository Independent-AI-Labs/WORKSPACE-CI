import clsx from 'clsx'
import type { CSSProperties } from 'react'

interface ThemeLogoProps {
  src: string
  srcDark?: string
  srcLight?: string
  className?: string
  alt?: string
  colorVar?: string
}

export function ThemeLogo({
  src,
  srcDark,
  srcLight,
  className,
  alt = '',
  colorVar = 'var(--accent)',
}: ThemeLogoProps) {
  // Theme-specific full-color logos: render both and toggle via [data-theme]
  // (keeps it SSR-safe; no client store dependency).
  if (srcDark && srcLight) {
    return (
      <span
        className={clsx(className, 'theme-logo--themed')}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        <img src={srcLight} className="theme-logo__light" alt="" aria-hidden="true" />
        <img src={srcDark} className="theme-logo__dark" alt="" aria-hidden="true" />
      </span>
    )
  }

  // Single-color masked logo (mask + background-color fill).
  const style: CSSProperties = {
    display: 'inline-block',
    backgroundColor: colorVar,
    maskImage: `url('${src}')`,
    maskSize: 'contain',
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskImage: `url('${src}')`,
    WebkitMaskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
  }

  return (
    <span
      className={className}
      style={style}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    />
  )
}