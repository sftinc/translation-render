'use client'

import { Suspense, useState, useEffect, useActionState } from 'react'
import { useSearchParams, redirect } from 'next/navigation'
import Link from 'next/link'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { sendMagicLink, getEmailFromJwt, type AuthActionState } from '@/actions/auth'

export default function CheckEmailPage() {
	return (
		<Suspense fallback={<CheckEmailSkeleton />}>
			<CheckEmailContent />
		</Suspense>
	)
}

function CheckEmailSkeleton() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center p-6">
			<div className="text-center max-w-md bg-[var(--card-bg)] p-10 rounded-lg shadow-[0_2px_8px_var(--shadow-color)]">
				<div className="animate-pulse">
					<div className="h-12 w-12 bg-[var(--border)] rounded-full mx-auto mb-4" />
					<div className="h-6 bg-[var(--border)] rounded mb-4 mx-auto w-3/4" />
					<div className="h-4 bg-[var(--border)] rounded mb-2 mx-auto w-full" />
				</div>
			</div>
		</main>
	)
}

function CheckEmailContent() {
	const searchParams = useSearchParams()
	const emailJwt = searchParams.get('t')
	const [email, setEmail] = useState<string | null>(null)
	const [isVerifying, setIsVerifying] = useState(true)

	const [state, formAction] = useActionState<AuthActionState, FormData>(sendMagicLink, null)

	// Verify JWT and extract email via server action
	useEffect(() => {
		async function verifyJwt() {
			if (!emailJwt) {
				redirect('/login')
				return
			}

			try {
				// Use server action to verify JWT (AUTH_SECRET not available client-side)
				const extractedEmail = await getEmailFromJwt(emailJwt)

				if (!extractedEmail) {
					redirect('/login')
					return
				}

				setEmail(extractedEmail)
			} catch {
				redirect('/login')
			} finally {
				setIsVerifying(false)
			}
		}

		verifyJwt()
	}, [emailJwt])

	if (isVerifying || !email || !emailJwt) {
		return <CheckEmailSkeleton />
	}

	const handleResend = (formData: FormData) => {
		// Pass the JWT to skip Turnstile verification on resend
		formData.set('emailJwt', emailJwt)
		formAction(formData)
	}

	return (
		<main className="flex min-h-screen flex-col">
			<div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-end">
				<ThemeToggle />
			</div>
			<div className="flex flex-1 flex-col items-center justify-center p-6">
				<div className="text-center max-w-md bg-[var(--card-bg)] p-10 rounded-lg shadow-[0_2px_8px_var(--shadow-color)]">
					<div className="mb-4 text-5xl">📧</div>
					<h1 className="text-2xl font-semibold mb-4 text-[var(--text-heading)]">
						Check your email
					</h1>
					<p className="text-base leading-relaxed text-[var(--text-muted)]">
						A sign-in link has been sent to{' '}
						<strong className="text-[var(--text-body)]">{email}</strong>
					</p>
					<p className="mt-2 text-sm text-[var(--text-muted)]">
						Click the link in the email to sign in, or enter the code manually. The link and
						code expire in 10 minutes.
					</p>

					{state?.error && (
						<div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
							{state.error}
						</div>
					)}

					<div className="mt-6 space-y-3">
						<Link
							href={`/login/enter-code?t=${encodeURIComponent(emailJwt)}`}
							className="block w-full py-3 bg-[var(--accent)] text-white rounded-md font-medium hover:opacity-90 transition text-center"
						>
							Enter code manually
						</Link>

						<form action={handleResend}>
							<input type="hidden" name="email" value={email} />
							<SubmitButton variant="secondary">Resend email</SubmitButton>
						</form>
					</div>
				</div>
			</div>
		</main>
	)
}
