import { pool } from '@pantolingo/db/pool'
import type { Adapter } from 'next-auth/adapters'

const MAX_FAILED_ATTEMPTS = 5

interface AuthTokenRow {
	token: string
	failed_attempts: number
}

interface AccountRow {
	id: number
	email: string
	name: string | null
	verified_at: Date | null
}

interface AccountWithPasswordRow extends AccountRow {
	password_hash: string | null
}

/**
 * Get user by email with password_hash for credentials auth
 */
export async function getUserByEmailWithPassword(email: string) {
	const result = await pool.query<AccountWithPasswordRow>(
		`SELECT id, email, name, verified_at, password_hash FROM account WHERE email = $1`,
		[email]
	)
	if (!result.rows[0]) return null
	const row = result.rows[0]
	return {
		id: String(row.id),
		accountId: row.id,
		email: row.email,
		name: row.name,
		emailVerified: row.verified_at ? new Date(row.verified_at) : null,
		passwordHash: row.password_hash,
	}
}

/**
 * Get verification token by email and code
 * Returns the token if found, not expired, and under the failed attempts limit
 * Only checks the most recent token for this email
 */
export async function getTokenByCode(email: string, code: string): Promise<string | null> {
	const result = await pool.query<AuthTokenRow>(
		`SELECT token, failed_attempts
		 FROM auth_token
		 WHERE identifier = $1
		   AND UPPER(code) = UPPER($2)
		   AND expires_at > NOW()
		   AND (failed_attempts IS NULL OR failed_attempts < $3)
		 ORDER BY created_at DESC
		 LIMIT 1`,
		[email, code, MAX_FAILED_ATTEMPTS]
	)
	return result.rows[0]?.token ?? null
}

/**
 * Increment failed attempts for an email's most recent verification token
 * Deletes the token if max attempts reached
 * Returns the new failed attempts count (or MAX_FAILED_ATTEMPTS if deleted)
 */
export async function incrementFailedAttempts(email: string): Promise<number> {
	// Increment failed_attempts on most recent token only
	const result = await pool.query<{ token: string; failed_attempts: number }>(
		`UPDATE auth_token
		 SET failed_attempts = COALESCE(failed_attempts, 0) + 1
		 WHERE token = (
		   SELECT token FROM auth_token
		   WHERE identifier = $1 AND expires_at > NOW()
		   ORDER BY created_at DESC
		   LIMIT 1
		 )
		 RETURNING token, failed_attempts`,
		[email]
	)

	if (!result.rows[0]) {
		// No token found
		return MAX_FAILED_ATTEMPTS
	}

	const { token, failed_attempts: newCount } = result.rows[0]

	// Delete token if max attempts reached
	if (newCount >= MAX_FAILED_ATTEMPTS) {
		await pool.query(`DELETE FROM auth_token WHERE token = $1`, [token])
	}

	return newCount
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
				`INSERT INTO auth_session (session_token, account_id, expires_at) VALUES ($1, $2, $3)`,
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
				expires_at: Date
				id: number
				email: string
				name: string | null
				verified_at: Date | null
			}>(
				`SELECT s.session_token, s.account_id, s.expires_at, a.id, a.email, a.name, a.verified_at
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
					expires: row.expires_at,
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
				expires_at: Date
			}>(
				`UPDATE auth_session SET expires_at = $1 WHERE session_token = $2
				 RETURNING session_token, account_id, expires_at`,
				[session.expires, session.sessionToken]
			)
			if (!result.rows[0]) return null
			const row = result.rows[0]
			return {
				sessionToken: row.session_token,
				userId: String(row.account_id),
				expires: row.expires_at,
			}
		},

		async deleteSession(sessionToken) {
			await pool.query(`DELETE FROM auth_session WHERE session_token = $1`, [sessionToken])
		},

		// Verification token methods (for magic links)
		async createVerificationToken(token) {
			await pool.query(
				`INSERT INTO auth_token (identifier, token, expires_at) VALUES ($1, $2, $3)
				 ON CONFLICT (identifier, token) DO NOTHING`,
				[token.identifier, token.token, token.expires]
			)
			return token
		},

		async useVerificationToken({ identifier, token }) {
			// Single query: delete token (if valid and not expired) and update account in one round-trip
			const result = await pool.query<{ identifier: string; token: string; expires_at: Date }>(
				`WITH deleted_token AS (
					DELETE FROM auth_token
					WHERE identifier = $1 AND token = $2 AND expires_at > NOW()
					RETURNING identifier, token, expires_at
				), update_account AS (
					UPDATE account
					SET verified_at = NOW()
					WHERE email = $1
					  AND verified_at IS NULL
					  AND EXISTS (SELECT 1 FROM deleted_token)
				)
				SELECT identifier, token, expires_at FROM deleted_token`,
				[identifier, token]
			)

			if (!result.rows[0]) {
				return null
			}

			const row = result.rows[0]
			return {
				identifier: row.identifier,
				token: row.token,
				expires: row.expires_at,
			}
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
