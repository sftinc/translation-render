'use server'

import { auth } from '@/lib/auth'
import {
	canAccessOrigin,
	updateSegmentTranslation,
	updatePathTranslation,
	markSegmentReviewed,
	markPathReviewed,
} from '@pantolingo/db'

async function requireProfileId(): Promise<number> {
	const session = await auth()
	if (!session?.user?.profileId) {
		throw new Error('Unauthorized')
	}
	return session.user.profileId
}

export async function saveSegmentTranslation(
	originId: number,
	originSegmentId: number,
	lang: string,
	text: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const profileId = await requireProfileId()

		if (!(await canAccessOrigin(profileId, originId))) {
			return { success: true } // Silent success - don't leak existence
		}

		return updateSegmentTranslation(originId, originSegmentId, lang, text)
	} catch {
		return { success: false, error: 'An error occurred' }
	}
}

export async function savePathTranslation(
	originId: number,
	originPathId: number,
	lang: string,
	text: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const profileId = await requireProfileId()

		if (!(await canAccessOrigin(profileId, originId))) {
			return { success: true } // Silent success - don't leak existence
		}

		return updatePathTranslation(originId, originPathId, lang, text)
	} catch {
		return { success: false, error: 'An error occurred' }
	}
}

export async function reviewSegment(
	originId: number,
	originSegmentId: number,
	lang: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const profileId = await requireProfileId()

		if (!(await canAccessOrigin(profileId, originId))) {
			return { success: true } // Silent success - don't leak existence
		}

		return markSegmentReviewed(originId, originSegmentId, lang)
	} catch {
		return { success: false, error: 'An error occurred' }
	}
}

export async function reviewPath(
	originId: number,
	originPathId: number,
	lang: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const profileId = await requireProfileId()

		if (!(await canAccessOrigin(profileId, originId))) {
			return { success: true } // Silent success - don't leak existence
		}

		return markPathReviewed(originId, originPathId, lang)
	} catch {
		return { success: false, error: 'An error occurred' }
	}
}
