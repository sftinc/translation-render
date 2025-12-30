import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pantolingo',
  description: 'Website translation made simple',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
