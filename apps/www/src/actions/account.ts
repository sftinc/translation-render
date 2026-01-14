'use server'

import { auth } from '@/lib/auth'
import { pool } from '@pantolingo/db/pool'
import { redirect } from 'next/navigation'

const MAX_NAME_LENGTH = 100

export type AccountActionState = { error?: string } | null

/**
 * Update the current user's account name
 * Signature is compatible with useActionState: (prevState, formData) => Promise<state>
 * On success, redirects to /dashboard (throws, never returns)
 */
export async function updateAccountName(
	_prevState: AccountActionState,
	formData: FormData
): Promise<AccountActionState> {
	const session = await auth()
	if (!session?.user?.accountId) {
		return { error: 'Unauthorized' }
	}

	const name = formData.get('name')
	if (typeof name !== 'string') {
		return { error: 'Name is required' }
	}

	const trimmedName = name.trim()
	if (!trimmedName) {
		return { error: 'Name is required' }
	}

	if (trimmedName.length > MAX_NAME_LENGTH) {
		return { error: `Name must be ${MAX_NAME_LENGTH} characters or less` }
	}

	try {
		await pool.query(`UPDATE account SET name = $1, updated_at = NOW() WHERE id = $2`, [
			trimmedName,
			session.user.accountId,
		])
	} catch (error) {
		console.error('Failed to update account name:', error)
		return { error: 'Failed to update account' }
	}

	redirect('/dashboard')
}
