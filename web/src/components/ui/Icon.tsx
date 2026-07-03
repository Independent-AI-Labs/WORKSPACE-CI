'use client'

import clsx from 'clsx'

interface IconProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

const sizeMap = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
}

export function Icon({ name, size = 'md', className, label }: IconProps) {
  return (
    <i
      className={clsx(name, sizeMap[size], className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    />
  )
}
