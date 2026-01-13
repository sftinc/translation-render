import 'next-auth'

declare module 'next-auth' {
	interface Session {
		user: {
			id: string
			profileId: number
			email: string
			name?: string | null
		}
	}

	interface User {
		id: string
		profileId: number
		email: string
		name?: string | null
	}
}
