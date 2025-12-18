/**
 * PostgreSQL connection pool
 * Replaces in-memory cache with persistent database storage
 */

import { Pool } from 'pg'

// Connection pool with SSL for Render
export const pool = new Pool({
	connectionString: process.env.POSTGRES_DB_URL,
	max: 50, // Maximum connections (single instance)
	idleTimeoutMillis: 30000, // Close idle connections after 30s
	connectionTimeoutMillis: 10000, // Connection timeout
	ssl: process.env.POSTGRES_DB_URL?.includes('render.com')
		? { rejectUnauthorized: false }
		: false, // Only use SSL for Render
})

/**
 * Test database connection
 * Call on startup to verify connectivity
 */
export async function testConnection(): Promise<boolean> {
	try {
		await pool.query('SELECT 1')
		return true
	} catch (error) {
		console.error('PostgreSQL connection failed:', error)
		return false
	}
}

/**
 * Graceful shutdown - close all connections
 */
export async function closePool(): Promise<void> {
	await pool.end()
}
