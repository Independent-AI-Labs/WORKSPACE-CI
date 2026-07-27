'use client'

import { forwardRef, ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', size = 'md', loading = false, className, children, disabled, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={clsx('btn', `btn--${variant}`, `btn--${size}`, className)}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        {...props}
      >
        {loading && <i className="ri-loader-4-line animate-spin" aria-hidden="true" />}
        {children}
      </button>
    )
  },
)
