'use server'

import {
	updateSegmentTranslation,
	updatePathTranslation,
	markSegmentReviewed,
	markPathReviewed,
} from '@pantolingo/db'

export async function saveSegmentTranslation(
	originSegmentId: number,
	lang: string,
	text: string
): Promise<{ success: boolean; error?: string }> {
	return updateSegmentTranslation(originSegmentId, lang, text)
}

export async function savePathTranslation(
	originPathId: number,
	lang: string,
	text: string
): Promise<{ success: boolean; error?: string }> {
	return updatePathTranslation(originPathId, lang, text)
}

export async function reviewSegment(
	originSegmentId: number,
	lang: string
): Promise<{ success: boolean; error?: string }> {
	return markSegmentReviewed(originSegmentId, lang)
}

export async function reviewPath(
	originPathId: number,
	lang: string
): Promise<{ success: boolean; error?: string }> {
	return markPathReviewed(originPathId, lang)
}
