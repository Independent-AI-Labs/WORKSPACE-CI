import type { Metadata, Viewport } from 'next'
import { ThemeScript } from '@workspace-ci/web-components/theme-script'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'HITL Approval',
  description: 'Human-in-the-loop approval surface',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="hitl-body">{children}</body>
    </html>
  )
}
