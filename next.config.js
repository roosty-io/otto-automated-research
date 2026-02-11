/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Externalize server-only packages that cause webpack issues
    serverComponentsExternalPackages: [
      'puppeteer',
      'puppeteer-core',
      'puppeteer-extra',
      'puppeteer-extra-plugin-stealth',
      'puppeteer-extra-plugin',
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize puppeteer-related packages for server builds
      config.externals = config.externals || []
      config.externals.push({
        'puppeteer': 'commonjs puppeteer',
        'puppeteer-core': 'commonjs puppeteer-core',
        'puppeteer-extra': 'commonjs puppeteer-extra',
        'puppeteer-extra-plugin-stealth': 'commonjs puppeteer-extra-plugin-stealth',
        'puppeteer-extra-plugin': 'commonjs puppeteer-extra-plugin',
      })
    }
    return config
  },
}

module.exports = nextConfig
