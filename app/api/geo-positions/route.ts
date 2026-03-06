import type {
  ContributionPayload,
  GeoPosition,
  GeoPositionStore,
} from '@/types/geo-position';
import { NextRequest, NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO =
  process.env.GITHUB_REPO || 'jonaschlegel/rijksmuseum-suriname-collection';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH = 'data/geo-positions.json';

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // max contributions per minute per IP
const RATE_WINDOW = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

/**
 * GET /api/geo-positions
 * Returns the current geo-positions store.
 * Optionally filter by ?object=SK-A-1234
 */
export async function GET(request: NextRequest) {
  try {
    const data = await import('@/data/geo-positions.json');
    const store: GeoPositionStore = data.default as GeoPositionStore;

    const objectnummer = request.nextUrl.searchParams.get('object');
    if (objectnummer) {
      const positions = store[objectnummer] || [];
      return NextResponse.json({ positions });
    }

    return NextResponse.json({ store });
  } catch {
    return NextResponse.json(
      { error: 'Failed to load geo-positions' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/geo-positions
 * Submit a new geo-position contribution.
 * Commits the change to the GitHub repo via the Contents API.
 */
export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      {
        error:
          'Rate limit exceeded. Please wait a moment before contributing again.',
      },
      { status: 429 },
    );
  }

  if (!GITHUB_TOKEN) {
    return NextResponse.json(
      {
        error:
          'GitHub integration not configured. Set the GITHUB_TOKEN environment variable.',
      },
      { status: 503 },
    );
  }

  // Parse and validate the payload
  let payload: ContributionPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    objectnummer,
    lat,
    lng,
    bearing,
    fieldOfView,
    radiusMeters,
    uncertainty,
    isOutdoor,
    locationType,
    confirmedKeywords,
  } = payload;

  if (
    !objectnummer ||
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    typeof bearing !== 'number' ||
    typeof fieldOfView !== 'number' ||
    typeof radiusMeters !== 'number' ||
    !uncertainty ||
    !['exact', 'approximate', 'rough'].includes(uncertainty) ||
    typeof isOutdoor !== 'boolean' ||
    !locationType
  ) {
    return NextResponse.json(
      { error: 'Missing or invalid required fields' },
      { status: 400 },
    );
  }

  if (bearing < 0 || bearing > 360 || fieldOfView < 1 || fieldOfView > 180) {
    return NextResponse.json(
      { error: 'bearing must be 0–360, fieldOfView must be 1–180' },
      { status: 400 },
    );
  }

  if (radiusMeters < 10 || radiusMeters > 2000) {
    return NextResponse.json(
      { error: 'radiusMeters must be 10–2000' },
      { status: 400 },
    );
  }

  // Try to get contributor from session cookie
  let contributor: string | null = null;
  try {
    const sessionCookie = request.cookies.get('geo-session')?.value;
    if (sessionCookie) {
      const session = JSON.parse(sessionCookie);
      contributor = session.username || null;
    }
  } catch {
    // No session, anonymous contribution
  }

  // Build the new GeoPosition entry
  const newPosition: GeoPosition = {
    objectnummer,
    lat,
    lng,
    bearing,
    fieldOfView,
    radiusMeters,
    uncertainty,
    isOutdoor,
    locationType,
    confirmedKeywords: confirmedKeywords || [],
    contributor,
    contributedAt: new Date().toISOString(),
    status: 'pending',
  };

  // Commit via GitHub API with retry on conflict
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await commitGeoPosition(newPosition);
      return NextResponse.json({
        success: true,
        position: newPosition,
        commitSha: result.commit.sha,
      });
    } catch (error: unknown) {
      const isConflict =
        error instanceof Error && error.message.includes('409');
      if (isConflict && attempt < maxRetries - 1) {
        // Wait briefly and retry (another write happened simultaneously)
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      console.error('Failed to commit geo-position:', error);
      return NextResponse.json(
        { error: 'Failed to save geo-position. Please try again.' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: 'Failed after retries' }, { status: 500 });
}

/**
 * Fetch the current file from GitHub, merge the new position, and commit.
 * Uses the Contents API with SHA-based compare-and-swap for concurrency safety.
 */
async function commitGeoPosition(
  position: GeoPosition,
): Promise<{ commit: { sha: string } }> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // 1. Get current file content + SHA
  const getResponse = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, {
    headers,
    cache: 'no-store',
  });

  if (!getResponse.ok) {
    throw new Error(`GitHub GET failed: ${getResponse.status}`);
  }

  const fileData = await getResponse.json();
  const currentSha = fileData.sha;

  // Decode base64 content
  const currentContent = Buffer.from(fileData.content, 'base64').toString(
    'utf-8',
  );
  const store: GeoPositionStore = JSON.parse(currentContent);

  // 2. Merge the new position
  if (!store[position.objectnummer]) {
    store[position.objectnummer] = [];
  }
  store[position.objectnummer].push(position);

  // 3. Commit updated file
  const updatedContent = Buffer.from(
    JSON.stringify(store, null, 2),
    'utf-8',
  ).toString('base64');

  const putResponse = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `geo-position: ${position.objectnummer} by ${position.contributor || 'anonymous'}`,
      content: updatedContent,
      sha: currentSha,
      branch: GITHUB_BRANCH,
    }),
  });

  if (!putResponse.ok) {
    const errorText = await putResponse.text();
    throw new Error(`GitHub PUT failed: ${putResponse.status} — ${errorText}`);
  }

  return putResponse.json();
}
