'use client'

import { useActionState } from 'react'
import { updateProfileName, type ProfileActionState } from '@/actions/profile'

export default function OnboardingPage() {
	const [state, formAction, isPending] = useActionState<ProfileActionState, FormData>(
		updateProfileName,
		null
	)

	return (
		<main className="flex min-h-screen flex-col items-center justify-center p-6">
			<div className="w-full max-w-md bg-[var(--card-bg)] p-10 rounded-lg shadow-[0_2px_8px_var(--shadow-color)]">
				<h1 className="text-3xl font-semibold mb-2 text-[var(--text-heading)] text-center">
					Welcome to Pantolingo
				</h1>
				<p className="text-base text-[var(--text-muted)] mb-8 text-center">
					Let&apos;s get you set up. What&apos;s your name?
				</p>

				{state?.error && (
					<div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">{state.error}</div>
				)}

				<form action={formAction}>
					<label htmlFor="name" className="block text-sm font-medium text-[var(--text-body)] mb-2">
						Your name
					</label>
					<input
						id="name"
						name="name"
						type="text"
						required
						autoFocus
						disabled={isPending}
						placeholder="Jane Smith"
						className="w-full px-4 py-3 rounded-md border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-body)] mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent disabled:opacity-50"
					/>
					<button
						type="submit"
						disabled={isPending}
						className="w-full py-3 bg-[var(--primary)] text-white rounded-md font-medium hover:opacity-90 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isPending ? 'Saving...' : 'Continue'}
					</button>
				</form>
			</div>
		</main>
	)
}
