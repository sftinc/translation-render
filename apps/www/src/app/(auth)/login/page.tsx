import { signIn } from '@/lib/auth'

function getSafeCallbackUrl(url: string | undefined): string {
	if (!url) return '/dashboard'
	// Only allow relative paths starting with / (but not // which could be protocol-relative)
	if (url.startsWith('/') && !url.startsWith('//')) {
		return url
	}
	return '/dashboard'
}

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
	const { callbackUrl, error } = await searchParams
	const safeCallbackUrl = getSafeCallbackUrl(callbackUrl)

	async function handleSignIn(formData: FormData) {
		'use server'
		const email = formData.get('email') as string
		await signIn('smtp', {
			email,
			redirectTo: safeCallbackUrl,
		})
	}

	return (
		<main className="flex min-h-screen flex-col items-center justify-center p-6">
			<div className="w-full max-w-md bg-[var(--card-bg)] p-10 rounded-lg shadow-[0_2px_8px_var(--shadow-color)]">
				<h1 className="text-3xl font-semibold mb-2 text-[var(--text-heading)] text-center">
					Sign in to Pantolingo
				</h1>
				<p className="text-base text-[var(--text-muted)] mb-8 text-center">
					Enter your email to receive a magic link
				</p>

				{error && (
					<div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
						{error === 'Verification' && 'The magic link has expired or is invalid.'}
						{error === 'Configuration' && 'Server configuration error. Please try again later.'}
						{!['Verification', 'Configuration'].includes(error) && 'An error occurred. Please try again.'}
					</div>
				)}

				<form action={handleSignIn}>
					<label htmlFor="email" className="block text-sm font-medium text-[var(--text-body)] mb-2">
						Email address
					</label>
					<input
						id="email"
						name="email"
						type="email"
						required
						autoFocus
						placeholder="you@example.com"
						className="w-full px-4 py-3 rounded-md border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-body)] mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
					/>
					<button
						type="submit"
						className="w-full py-3 bg-[var(--primary)] text-white rounded-md font-medium hover:opacity-90 transition cursor-pointer"
					>
						Send magic link
					</button>
				</form>
			</div>
		</main>
	)
}
