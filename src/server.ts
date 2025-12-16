/**
 * Express server entry point for the translation proxy
 */

import 'dotenv/config'
import express from 'express'
import { handleRequest } from './index'
import { MemoryCache } from './memory-cache'

const app = express()
const cache = new MemoryCache()
const PORT = process.env.PORT || 8787

// Parse raw body for POST/PUT requests
app.use(express.raw({ type: '*/*', limit: '10mb' }))

// Health check endpoint
app.get('/health', (_req, res) => {
	res.status(200).json({ status: 'ok', cache: cache.getStats() })
})

// Main request handler
app.use(async (req, res) => {
	try {
		await handleRequest(req, res, cache)
	} catch (error) {
		console.error('Unhandled error:', error)
		if (!res.headersSent) {
			res.status(500).send('Internal Server Error')
		}
	}
})

// Periodic cache cleanup (every hour)
setInterval(() => {
	const removed = cache.cleanup()
	if (removed > 0) {
		console.log(`[Cache Cleanup] Removed ${removed} expired entries`)
	}
}, 60 * 60 * 1000)

app.listen(PORT, () => {
	console.log(`Translation proxy running on port ${PORT} (http://localhost:${PORT})`)
	console.log(`Cache initialized (in-memory)`)
})
