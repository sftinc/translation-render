import 'next-auth'

declare module 'next-auth' {
	interface Session {
		user: {
			id: string
			accountId: number
			email: string
			name?: string | null
		}
	}

	interface User {
		id: string
		accountId: number
		email: string
		name?: string | null
	}
}
