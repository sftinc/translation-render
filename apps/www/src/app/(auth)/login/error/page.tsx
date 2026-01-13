import Link from 'next/link'

export default async function AuthErrorPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>
}) {
	const { error } = await searchParams

	return (
		<main className="flex min-h-screen flex-col items-center justify-center p-6">
			<div className="text-center max-w-md bg-[var(--card-bg)] p-10 rounded-lg shadow-[0_2px_8px_var(--shadow-color)]">
				<div className="mb-4 text-5xl">⚠️</div>
				<h1 className="text-2xl font-semibold mb-4 text-[var(--text-heading)]">Authentication Error</h1>
				<p className="text-base leading-relaxed text-[var(--text-muted)] mb-6">
					{error === 'Verification' && 'The magic link has expired or is invalid. Please request a new one.'}
					{error === 'Configuration' && 'There was a server configuration error. Please try again later.'}
					{error === 'AccessDenied' && 'Access was denied. Please try again.'}
					{!error && 'Something went wrong during sign in. Please try again.'}
					{error && !['Verification', 'Configuration', 'AccessDenied'].includes(error) &&
						'Something went wrong during sign in. Please try again.'}
				</p>
				<Link
					href="/login"
					className="inline-block px-6 py-3 bg-[var(--primary)] text-white rounded-md font-medium hover:opacity-90 transition"
				>
					Back to sign in
				</Link>
			</div>
		</main>
	)
}
