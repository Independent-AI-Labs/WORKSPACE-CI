import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bundleAnalyzer from '@next/bundle-analyzer'

const webRoot = path.dirname(fileURLToPath(import.meta.url))

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  // npm workspaces monorepo: deps hoist to the repo-root lockfile/node_modules;
  // trace standalone output from the workspace root so hoisted deps ship.
  outputFileTracingRoot: path.resolve(webRoot, '..'),
  transpilePackages: ['@workspace-ci/web-components'],
  output: 'standalone',
  reactStrictMode: true,
  images: { formats: ['image/avif', 'image/webp'] },
  allowedDevOrigins: ['127.0.0.1', 'localhost', '0.0.0.0', '192.168.50.63'],
}

export default withBundleAnalyzer(nextConfig)