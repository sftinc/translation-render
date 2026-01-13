export default function VerifyRequestPage() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center p-6">
			<div className="text-center max-w-md bg-[var(--card-bg)] p-10 rounded-lg shadow-[0_2px_8px_var(--shadow-color)]">
				<div className="mb-4 text-5xl">📧</div>
				<h1 className="text-2xl font-semibold mb-4 text-[var(--text-heading)]">Check your email</h1>
				<p className="text-base leading-relaxed text-[var(--text-muted)]">
					A sign-in link has been sent to your email address. Click the link to sign in to your account.
				</p>
				<p className="mt-4 text-sm text-[var(--text-muted)]">The link expires in 1 hour.</p>
			</div>
		</main>
	)
}
