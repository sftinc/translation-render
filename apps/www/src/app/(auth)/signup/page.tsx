import { redirect } from 'next/navigation'

export default function SignupPage() {
	// Magic link auth doesn't distinguish signup from login
	redirect('/login')
}
