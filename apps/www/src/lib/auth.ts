import NextAuth from 'next-auth'
import type { Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import Credentials from 'next-auth/providers/credentials'
import { pool } from '@pantolingo/db/pool'
import { PantolingoAdapter, getUserByEmailWithPassword } from './auth-adapter'
import { SmtpProvider } from './auth-email'
import { verifyPassword } from './password'

const authConfig = {
	trustHost: true,
	adapter: PantolingoAdapter(),
	providers: [
		SmtpProvider(),
		Credentials({
			credentials: {
				email: { label: 'Email', type: 'email' },
				password: { label: 'Password', type: 'password' },
			},
			async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) {
					return null
				}

				const email = credentials.email as string
				const password = credentials.password as string

				const user = await getUserByEmailWithPassword(email)
				if (!user || !user.passwordHash) {
					return null
				}

				const isValid = await verifyPassword(password, user.passwordHash)
				if (!isValid) {
					return null
				}

				return {
					id: user.id,
					accountId: user.accountId,
					email: user.email,
					name: user.name,
				}
			},
		}),
	],
	session: {
		strategy: 'jwt' as const,
		maxAge: 24 * 60 * 60, // 1 day - logout after 1 day of inactivity
		updateAge: 60 * 60, // 1 hour - refresh token if older than 1 hour
	},
	pages: {
		signIn: '/login',
		verifyRequest: '/login/check-email',
		error: '/login/error',
	},
	callbacks: {
		async jwt({ token, user }: { token: JWT; user?: { accountId?: number } }) {
			// On sign-in, user is available - persist accountId to token
			if (user?.accountId) {
				token.accountId = user.accountId
				// Record last login time
				pool.query(`UPDATE account SET last_login_at = NOW() WHERE id = $1`, [user.accountId]).catch(
					(err) => console.error('Failed to update last_login_at:', err)
				)
			}
			return token
		},
		async session({ session, token }: { session: Session; token: JWT }) {
			// Read from token, not user
			if (session.user && token.accountId) {
				session.user.accountId = token.accountId as number
			}
			return session
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

/**
 * Require authentication and return the account ID
 * @throws Error if not authenticated
 */
export async function requireAccountId(): Promise<number> {
	const session = await auth()
	if (!session?.user?.accountId) {
		throw new Error('Unauthorized')
	}
	return session.user.accountId
}
