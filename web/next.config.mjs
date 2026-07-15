import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bundleAnalyzer from '@next/bundle-analyzer'

const webRoot = path.dirname(fileURLToPath(import.meta.url))

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  // Pin Turbopack root to CI/web: parent WORKSPACE-VM/package-lock.json was
  // winning and HMR served stale/wrong-tree bundles.
  turbopack: {
    root: webRoot,
  },
  output: 'standalone',
  reactStrictMode: true,
  images: { formats: ['image/avif', 'image/webp'] },
  allowedDevOrigins: ['127.0.0.1', 'localhost', '0.0.0.0', '192.168.50.63'],
}

export default withBundleAnalyzer(nextConfig)