import { MetadataRoute } from 'next'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ottoresearch.io'

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '',
    '/research',
    '/products',
    '/store',
    '/analytics',
    '/automation',
    '/policy',
  ]

  return routes.map((route) => ({
    url: `${APP_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }))
}
