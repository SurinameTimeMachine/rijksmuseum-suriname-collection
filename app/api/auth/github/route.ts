import { NextRequest, NextResponse } from 'next/server';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

/**
 * GET /api/auth/github
 * Initiates GitHub OAuth flow by redirecting to GitHub's authorize URL.
 *
 * POST /api/auth/github
 * Handles the OAuth callback — exchanges the code for a token,
 * fetches the user profile, and sets a session cookie.
 */
export async function GET(request: NextRequest) {
  if (!GITHUB_CLIENT_ID) {
    return NextResponse.json(
      { error: 'GitHub OAuth not configured' },
      { status: 503 },
    );
  }

  // Get the return URL from query params
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/';
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set('scope', '');
  authorizeUrl.searchParams.set('state', state);

  return NextResponse.redirect(authorizeUrl.toString());
}

export async function POST(request: NextRequest) {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'GitHub OAuth not configured' },
      { status: 503 },
    );
  }

  let body: { code: string; state?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { code, state } = body;
  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
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
    return NextResponse.json(
      { error: 'Failed to exchange OAuth code' },
      { status: 502 },
    );
  }

  const tokenData = await tokenResponse.json();
  if (tokenData.error) {
    return NextResponse.json(
      { error: tokenData.error_description || 'OAuth error' },
      { status: 400 },
    );
  }

  // Fetch user profile
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!userResponse.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch GitHub profile' },
      { status: 502 },
    );
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
      // invalid state, use default
    }
  }

  // Set session cookie and return user info
  const session = {
    username: user.login,
    avatarUrl: user.avatar_url,
  };

  const response = NextResponse.json({
    success: true,
    user: session,
    returnTo,
  });

  response.cookies.set('geo-session', JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return response;
}
