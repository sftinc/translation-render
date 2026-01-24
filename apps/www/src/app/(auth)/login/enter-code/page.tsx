'use client'

import { Suspense, useState, useEffect, useActionState } from 'react'
import { useSearchParams, redirect } from 'next/navigation'
import Link from 'next/link'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { verifyCode, type AuthActionState } from '@/actions/auth'

// Safe charset matching auth-code.ts (excludes 0/O, 1/I/L)
const SAFE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export default function EnterCodePage() {
	return (
		<Suspense fallback={<EnterCodeSkeleton />}>
			<EnterCodeContent />
		</Suspense>
	)
}

function EnterCodeSkeleton() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center p-6">
			<div className="text-center max-w-md bg-[var(--card-bg)] p-10 rounded-lg shadow-[0_2px_8px_var(--shadow-color)]">
				<div className="animate-pulse">
					<div className="h-6 bg-[var(--border)] rounded mb-4 mx-auto w-3/4" />
					<div className="h-4 bg-[var(--border)] rounded mb-6 mx-auto w-full" />
					<div className="h-12 bg-[var(--border)] rounded mb-4" />
					<div className="h-12 bg-[var(--border)] rounded" />
				</div>
			</div>
		</main>
	)
}

function EnterCodeContent() {
	const searchParams = useSearchParams()
	const emailJwt = searchParams.get('t')
	const [code, setCode] = useState('')
	const [state, formAction] = useActionState<AuthActionState, FormData>(verifyCode, null)

	// Redirect to login if no JWT
	useEffect(() => {
		if (!emailJwt) {
			redirect('/login')
		}
	}, [emailJwt])

	// Handle successful verification - perform hard redirect
	// (soft navigation via server redirect fails silently with NextAuth)
	useEffect(() => {
		if (state?.redirectUrl) {
			window.location.href = state.redirectUrl
		}
	}, [state?.redirectUrl])

	if (!emailJwt) {
		return null
	}

	const handleSubmit = (formData: FormData) => {
		formData.set('emailJwt', emailJwt)
		formAction(formData)
	}

	// Handle code input - uppercase and filter to safe charset only
	const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value.toUpperCase()
		const filtered = [...value].filter((c) => SAFE_CHARSET.includes(c)).join('')
		if (filtered.length <= 8) {
			setCode(filtered)
		}
	}

	return (
		<main className="flex min-h-screen flex-col">
			<div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-end">
				<ThemeToggle />
			</div>
			<div className="flex flex-1 flex-col items-center justify-center p-6">
				<div className="text-center max-w-md bg-[var(--card-bg)] p-10 rounded-lg shadow-[0_2px_8px_var(--shadow-color)]">
					<h1 className="text-2xl font-semibold mb-2 text-[var(--text-heading)]">
						Enter your code
					</h1>
					<p className="text-base text-[var(--text-muted)] mb-6">
						Enter the 8-character code from your email
					</p>

					{state?.error && (
						<div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
							{state.error}
						</div>
					)}

					<form action={handleSubmit}>
						<input
							type="text"
							name="code"
							value={code}
							onChange={handleCodeChange}
							autoFocus
							autoComplete="one-time-code"
							placeholder="XXXXXXXX"
							className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest rounded-md border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-body)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] mb-4"
							maxLength={8}
						/>

						<SubmitButton>Continue with login code</SubmitButton>
					</form>

					<Link
						href={`/login/check-email?t=${encodeURIComponent(emailJwt)}`}
						className="mt-4 inline-block text-sm text-[var(--accent)] hover:underline"
					>
						Back to check email
					</Link>
				</div>
			</div>
		</main>
	)
}
