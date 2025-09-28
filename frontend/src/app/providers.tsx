'use client'

import { useRef } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dynamic from 'next/dynamic'

const Devtools = dynamic(
  () => import('@tanstack/react-query-devtools').then(m => m.ReactQueryDevtools),
  { ssr: false }
)

export default function Providers({ children }: { children: React.ReactNode }) {
  const clientRef = useRef<QueryClient>()
  if (!clientRef.current) {
    clientRef.current = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
      },
    })
  }
  const client = clientRef.current
  return (
    <QueryClientProvider client={client}>
      {children}
      <Devtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
