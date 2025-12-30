// Verify @pantolingo/db import resolves
import { testConnection } from '@pantolingo/db'

export default function DashboardPage() {
  // Note: testConnection is imported to verify the package resolves
  // It's not called here - this is just an import verification
  void testConnection

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">Dashboard</h1>
      <p className="text-lg text-gray-600">Coming soon</p>
    </main>
  )
}
