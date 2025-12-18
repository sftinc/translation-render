/**
 * Express server entry point for the translation proxy
 */

import 'dotenv/config'
import express from 'express'
import { handleRequest } from './index'
import { testConnection, closePool } from './db'

const app = express()
const PORT = process.env.PORT || 8787

// Parse raw body for POST/PUT requests
app.use(express.raw({ type: '*/*', limit: '10mb' }))

// Main request handler
app.use(async (req, res) => {
	try {
		await handleRequest(req, res)
	} catch (error) {
		console.error('Unhandled error:', error)
		if (!res.headersSent) {
			res.status(500).send('Internal Server Error')
		}
	}
})

// Graceful shutdown
process.on('SIGTERM', async () => {
	console.log('SIGTERM received, closing database pool...')
	await closePool()
	process.exit(0)
})

process.on('SIGINT', async () => {
	console.log('SIGINT received, closing database pool...')
	await closePool()
	process.exit(0)
})

// Start server
async function start() {
	// Test database connection
	const connected = await testConnection()
	if (!connected) {
		console.error('Failed to connect to PostgreSQL. Exiting.')
		process.exit(1)
	}
	console.log('PostgreSQL connected')

	app.listen(PORT, () => {
		console.log(`Translation proxy running on port ${PORT}`)
		if (PORT === 8787) console.log(`http://localhost:${PORT}`)
	})
}

start()
