import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type MiddlewareFn = (req: NextRequest) => Response | void | Promise<Response | void>

export default auth((req) => {
	const { pathname } = req.nextUrl
	const isLoggedIn = !!req.auth
	const userName = req.auth?.user?.name

	// Auth pages - redirect to dashboard if already logged in
	if (pathname === '/login' || pathname === '/signup') {
		if (isLoggedIn && userName) {
			return NextResponse.redirect(new URL('/dashboard', req.url))
		}
		return NextResponse.next()
	}

	// Onboarding - require session but allow null name
	if (pathname === '/onboarding') {
		if (!isLoggedIn) {
			return NextResponse.redirect(new URL('/login', req.url))
		}
		// If they already have a name, send to dashboard
		if (userName) {
			return NextResponse.redirect(new URL('/dashboard', req.url))
		}
		return NextResponse.next()
	}

	// Dashboard routes - require session with name
	if (pathname.startsWith('/dashboard')) {
		if (!isLoggedIn) {
			const callbackUrl = encodeURIComponent(pathname + req.nextUrl.search)
			return NextResponse.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, req.url))
		}
		// Redirect to onboarding if no name
		if (!userName) {
			return NextResponse.redirect(new URL('/onboarding', req.url))
		}
		return NextResponse.next()
	}

	return NextResponse.next()
}) as MiddlewareFn

export const config = {
	matcher: ['/dashboard/:path*', '/login', '/signup', '/onboarding'],
}

export const runtime = 'nodejs'
