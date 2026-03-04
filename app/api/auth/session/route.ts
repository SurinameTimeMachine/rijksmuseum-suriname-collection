import { NextRequest, NextResponse } from 'next/server';
import type { GeoSession } from '@/types/geo-position';

/**
 * GET /api/auth/session
 * Returns the current session from the cookie (if any).
 *
 * DELETE /api/auth/session
 * Logs out by clearing the session cookie.
 */
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('geo-session')?.value;

  if (!sessionCookie) {
    return NextResponse.json({ session: null });
  }

  try {
    const session: GeoSession = JSON.parse(sessionCookie);
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ session: null });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('geo-session');
  return response;
}
