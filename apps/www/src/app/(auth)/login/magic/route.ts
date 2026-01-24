import { NextResponse } from 'next/server'
import { pool } from '@pantolingo/db/pool'
import type { NextRequest } from 'next/server'

/**
 * Redirect clean magic link URL to NextAuth callback
 * /login/magic?token=... -> /api/auth/callback/smtp?token=...&email=...&callbackUrl=...
 *
 * Looks up email from token in database so it doesn't need to be in the URL
 * Uses NextResponse.redirect() for proper HTTP 307 redirects (not soft navigation)
 */
export async function GET(request: NextRequest) {
	const token = request.nextUrl.searchParams.get('token')
	const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/dashboard'
	const baseUrl = request.nextUrl.origin

	if (!token) {
		return NextResponse.redirect(new URL('/login?error=MissingToken', baseUrl))
	}

	// Look up email from token
	const result = await pool.query<{ identifier: string }>(
		`SELECT identifier FROM auth_token WHERE token = $1 AND expires_at > NOW()`,
		[token]
	)

	const email = result.rows[0]?.identifier
	if (!email) {
		return NextResponse.redirect(new URL('/login?error=Verification', baseUrl))
	}

	// Redirect to NextAuth callback with all required params
	const callbackParams = new URLSearchParams({
		token,
		email,
		callbackUrl,
	})
	return NextResponse.redirect(new URL(`/api/auth/callback/smtp?${callbackParams}`, baseUrl))
}
