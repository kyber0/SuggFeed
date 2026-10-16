import { NextResponse } from 'next/server';

/** This legacy application has no trusted school context. Retire all entrypoints. */
export function middleware() {
  return new NextResponse('This client is retired. Open the SuggFeed school website.', {
    status: 410,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export const config = { matcher: '/:path*' };
