import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/github/callback
 * GitHub redirects here after the user authorizes.
 * Exchanges the code for a token, sets the session, and redirects back.
 */
export async function GET(request: NextRequest) {
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Exchange code for access token
  const tokenResponse = await fetch(
    'https://github.com/login/oauth/access_token',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    },
  );

  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const tokenData = await tokenResponse.json();
  if (tokenData.error) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Fetch user profile
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!userResponse.ok) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const user = await userResponse.json();

  // Parse return URL from state
  let returnTo = '/';
  if (state) {
    try {
      const stateData = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf-8'),
      );
      returnTo = stateData.returnTo || '/';
    } catch {
      // invalid state
    }
  }

  const session = {
    username: user.login,
    avatarUrl: user.avatar_url,
  };

  const response = NextResponse.redirect(new URL(returnTo, request.url));

  response.cookies.set('geo-session', JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return response;
}
