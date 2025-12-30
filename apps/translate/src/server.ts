/**
 * Express server entry point for the translation proxy
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load .env from monorepo root (two levels up from apps/translate)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import express from 'express'
import { handleRequest } from './index.js'
import { testConnection, closePool } from '@pantolingo/db'

const app = express()
const PORT = process.env.PORT || 8787

// Parse raw body for POST/PUT requests
app.use(express.raw({ type: '*/*', limit: '10mb' }))

// Health check endpoint
app.get('/pantolingo/__healthcheck', (_req, res) => {
	res.json({ status: 'ok' })
})

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
const gracefulShutdown = async (signal: string) => {
	console.log(`${signal} received, closing database pool...`)
	await closePool()
	process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

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
