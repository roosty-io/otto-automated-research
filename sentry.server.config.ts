// Sentry configuration for server-side (Node.js)
import * as Sentry from "@sentry/nextjs"

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn: SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production" && !!SENTRY_DSN,

  // Performance monitoring - sample 10% of server transactions
  tracesSampleRate: 0.1,

  // Environment
  environment: process.env.NODE_ENV,

  // Set release for source maps
  // release: process.env.VERCEL_GIT_COMMIT_SHA,

  // Filter sensitive data
  beforeSend(event) {
    // Remove any potentially sensitive data
    if (event.request?.headers) {
      delete event.request.headers["authorization"]
      delete event.request.headers["cookie"]
    }
    return event
  },

  // Ignore specific errors
  ignoreErrors: [
    // Expected errors
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],

  // Add scraper context to errors
  integrations: [
    Sentry.extraErrorDataIntegration({ depth: 6 }),
  ],
})
