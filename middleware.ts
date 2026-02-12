// OTTO Research Labs - Next.js Middleware
// Route protection and session management

import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/auth/server'

// Routes that don't require authentication
const publicRoutes = [
  '/',
  '/login',
  '/register',
  '/auth/callback',
  '/auth/reset-password',
  '/api/auth',
  '/api/webhooks',
]

// Routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/stores',
  '/products',
  '/automation',
  '/settings',
  '/fleet',
  '/admin',
  '/onboarding',
  '/profit',
]

// Admin-only routes
const adminRoutes = [
  '/admin',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for static files and API routes (except protected ones)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Update session and get user
  const { supabaseResponse, user } = await updateSession(request)

  // Check if route is public
  const isPublicRoute = publicRoutes.some(route =>
    pathname === route || pathname.startsWith(`${route}/`)
  )

  // Check if route requires auth
  const isProtectedRoute = protectedRoutes.some(route =>
    pathname.startsWith(route)
  )

  // Check if route requires admin
  const isAdminRoute = adminRoutes.some(route =>
    pathname.startsWith(route)
  )

  // Redirect unauthenticated users from protected routes
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect authenticated users from auth pages to dashboard
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Check onboarding status for authenticated users
  if (user && isProtectedRoute && !pathname.startsWith('/onboarding')) {
    // Fetch user profile to check onboarding status
    // Note: In production, this should be cached or stored in session
    const onboardingComplete = request.cookies.get('onboarding_complete')?.value === 'true'

    if (!onboardingComplete && pathname !== '/onboarding') {
      // First time user, redirect to onboarding
      // return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  // Admin route protection would check user role from profile
  // For now, allow access (role check happens at API level)

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
