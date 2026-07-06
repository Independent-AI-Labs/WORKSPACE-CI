import type { CSSProperties } from 'react'

interface ThemeLogoProps {
  src: string
  className?: string
  alt?: string
  colorVar?: string
}

export function ThemeLogo({
  src,
  className,
  alt = '',
  colorVar = 'var(--accent)',
}: ThemeLogoProps) {
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