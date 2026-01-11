import type { NextConfig } from 'next'
import dotenv from 'dotenv'
import path from 'path'

// Load .env from monorepo root (two levels up from apps/www)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const nextConfig: NextConfig = {
  transpilePackages: ['@pantolingo/db', '@pantolingo/lang'],
}

export default nextConfig
