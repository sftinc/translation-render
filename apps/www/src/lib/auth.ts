import NextAuth from 'next-auth'
import type { Session } from 'next-auth'
import { PantolingoAdapter } from './auth-adapter'
import { SmtpProvider } from './auth-email'

const authConfig = {
	trustHost: true,
	adapter: PantolingoAdapter(),
	providers: [SmtpProvider()],
	session: {
		strategy: 'database' as const,
		maxAge: 30 * 24 * 60 * 60, // 30 days
		updateAge: 24 * 60 * 60, // Extend if used within 24h of expiry
	},
	pages: {
		signIn: '/login',
		verifyRequest: '/login/check-email',
		error: '/login/error',
	},
	callbacks: {
		async session({ session, user }: { session: Session; user: { accountId: number } }) {
			// Add accountId to session
			if (session.user) {
				session.user.accountId = user.accountId
			}
			return session
		},
	},
	logger: {
		error(error: Error) {
			if (error.message === 'Verification') return
			console.error('[auth]', error.message)
		},
		warn(code: string) {
			console.warn('[auth]', code)
		},
	},
}

const nextAuth = NextAuth(authConfig)

export const handlers: { GET: typeof nextAuth.handlers.GET; POST: typeof nextAuth.handlers.POST } =
	nextAuth.handlers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth: typeof nextAuth.auth = nextAuth.auth as any
export const signIn: typeof nextAuth.signIn = nextAuth.signIn
export const signOut: typeof nextAuth.signOut = nextAuth.signOut
