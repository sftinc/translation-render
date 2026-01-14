import { pool } from '@pantolingo/db/pool'
import type { Adapter } from 'next-auth/adapters'

interface AccountRow {
	id: number
	email: string
	name: string | null
	verified_at: Date | null
}

function toAdapterUser(row: AccountRow) {
	return {
		id: String(row.id),
		accountId: row.id,
		email: row.email,
		name: row.name,
		emailVerified: row.verified_at ? new Date(row.verified_at) : null,
	}
}

/**
 * Custom NextAuth adapter for Pantolingo
 * Maps to existing account table and auth_session/auth_token tables
 */
export function PantolingoAdapter(): Adapter {
	return {
		async createUser(user) {
			const result = await pool.query<AccountRow>(
				`INSERT INTO account (email, name) VALUES ($1, $2) RETURNING id, email, name, verified_at`,
				[user.email, user.name ?? null]
			)
			return toAdapterUser(result.rows[0])
		},

		async getUser(id) {
			const result = await pool.query<AccountRow>(
				`SELECT id, email, name, verified_at FROM account WHERE id = $1`,
				[parseInt(id, 10)]
			)
			if (!result.rows[0]) return null
			return toAdapterUser(result.rows[0])
		},

		async getUserByEmail(email) {
			const result = await pool.query<AccountRow>(
				`SELECT id, email, name, verified_at FROM account WHERE email = $1`,
				[email]
			)
			if (!result.rows[0]) return null
			return toAdapterUser(result.rows[0])
		},

		async updateUser(user) {
			const result = await pool.query<AccountRow>(
				`UPDATE account SET name = COALESCE($1, name), email = COALESCE($2, email), updated_at = NOW()
				 WHERE id = $3 RETURNING id, email, name, verified_at`,
				[user.name, user.email, parseInt(user.id!, 10)]
			)
			return toAdapterUser(result.rows[0])
		},

		async deleteUser(id) {
			await pool.query(`DELETE FROM account WHERE id = $1`, [parseInt(id, 10)])
		},

		// Session methods
		async createSession(session) {
			await pool.query(
				`INSERT INTO auth_session (session_token, account_id, expires) VALUES ($1, $2, $3)`,
				[session.sessionToken, parseInt(session.userId, 10), session.expires]
			)
			return {
				sessionToken: session.sessionToken,
				userId: session.userId,
				expires: session.expires,
			}
		},

		async getSessionAndUser(sessionToken) {
			const result = await pool.query<{
				session_token: string
				account_id: number
				expires: Date
				id: number
				email: string
				name: string | null
				verified_at: Date | null
			}>(
				`SELECT s.session_token, s.account_id, s.expires, a.id, a.email, a.name, a.verified_at
				 FROM auth_session s
				 JOIN account a ON a.id = s.account_id
				 WHERE s.session_token = $1`,
				[sessionToken]
			)
			if (!result.rows[0]) return null
			const row = result.rows[0]

			return {
				session: {
					sessionToken: row.session_token,
					userId: String(row.account_id),
					expires: row.expires,
				},
				user: {
					id: String(row.id),
					accountId: row.id,
					email: row.email,
					name: row.name,
					emailVerified: row.verified_at ? new Date(row.verified_at) : null,
				},
			}
		},

		async updateSession(session) {
			const result = await pool.query<{
				session_token: string
				account_id: number
				expires: Date
			}>(
				`UPDATE auth_session SET expires = $1 WHERE session_token = $2
				 RETURNING session_token, account_id, expires`,
				[session.expires, session.sessionToken]
			)
			if (!result.rows[0]) return null
			const row = result.rows[0]
			return {
				sessionToken: row.session_token,
				userId: String(row.account_id),
				expires: row.expires,
			}
		},

		async deleteSession(sessionToken) {
			await pool.query(`DELETE FROM auth_session WHERE session_token = $1`, [sessionToken])
		},

		// Verification token methods (for magic links)
		async createVerificationToken(token) {
			try {
				await pool.query(
					`INSERT INTO auth_token (identifier, token, expires) VALUES ($1, $2, $3)`,
					[token.identifier, token.token, token.expires]
				)
				console.log('[auth] Token created for', token.identifier)
				return token
			} catch (error) {
				console.error('[auth] Token creation failed for', token.identifier)
				throw error
			}
		},

		async useVerificationToken({ identifier, token }) {
			// Single query: delete token (if valid and not expired) and update account in one round-trip
			const result = await pool.query<{ identifier: string; token: string; expires: Date }>(
				`WITH deleted_token AS (
					DELETE FROM auth_token
					WHERE identifier = $1 AND token = $2 AND expires > NOW()
					RETURNING identifier, token, expires
				), update_account AS (
					UPDATE account
					SET verified_at = NOW()
					WHERE email = $1
					  AND verified_at IS NULL
					  AND EXISTS (SELECT 1 FROM deleted_token)
				)
				SELECT identifier, token, expires FROM deleted_token`,
				[identifier, token]
			)

			if (!result.rows[0]) {
				console.error('[auth] Token invalid, expired, or not found for', identifier)
				return null
			}

			console.log('[auth] Token verified for', identifier)
			return result.rows[0]
		},

		// OAuth methods - not used for magic link auth
		async linkAccount() {
			return undefined
		},
		async unlinkAccount() {
			return undefined
		},
		async getUserByAccount() {
			return null
		},
	}
}
