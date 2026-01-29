'use server'

import { requireAccountId } from '@/lib/auth'
import { canAccessWebsite, updateSegmentTranslation, updatePathTranslation } from '@pantolingo/db'

export async function saveSegmentTranslation(
	websiteId: number,
	websiteSegmentId: number,
	lang: string,
	text: string,
	reviewed?: boolean | null
): Promise<{ success: boolean; error?: string }> {
	try {
		const accountId = await requireAccountId()

		if (!(await canAccessWebsite(accountId, websiteId))) {
			return { success: true } // Silent success - don't leak existence
		}

		return updateSegmentTranslation(websiteId, websiteSegmentId, lang, text, reviewed, accountId)
	} catch {
		return { success: false, error: 'An error occurred' }
	}
}

export async function savePathTranslation(
	websiteId: number,
	websitePathId: number,
	lang: string,
	text: string,
	reviewed?: boolean | null
): Promise<{ success: boolean; error?: string }> {
	try {
		const accountId = await requireAccountId()

		if (!(await canAccessWebsite(accountId, websiteId))) {
			return { success: true } // Silent success - don't leak existence
		}

		return updatePathTranslation(websiteId, websitePathId, lang, text, reviewed, accountId)
	} catch {
		return { success: false, error: 'An error occurred' }
	}
}

