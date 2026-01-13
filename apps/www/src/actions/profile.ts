'use server'

import { auth } from '@/lib/auth'
import { pool } from '@pantolingo/db/pool'
import { redirect } from 'next/navigation'

const MAX_NAME_LENGTH = 100

export type ProfileActionState = { error?: string } | null

/**
 * Update the current user's profile name
 * Signature is compatible with useActionState: (prevState, formData) => Promise<state>
 * On success, redirects to /dashboard (throws, never returns)
 */
export async function updateProfileName(
	_prevState: ProfileActionState,
	formData: FormData
): Promise<ProfileActionState> {
	const session = await auth()
	if (!session?.user?.profileId) {
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
		await pool.query(`UPDATE profile SET name = $1, updated_at = NOW() WHERE id = $2`, [
			trimmedName,
			session.user.profileId,
		])
	} catch (error) {
		console.error('Failed to update profile name:', error)
		return { error: 'Failed to update profile' }
	}

	redirect('/dashboard')
}
