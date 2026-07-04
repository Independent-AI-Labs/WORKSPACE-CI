import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  reactStrictMode: true,
  images: { formats: ['image/avif', 'image/webp'] },
  allowedDevOrigins: ['127.0.0.1', 'localhost', '0.0.0.0', '192.168.50.63'],
}

export default withBundleAnalyzer(nextConfig)