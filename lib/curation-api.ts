import { NextResponse } from 'next/server';

/**
 * Curation API auth gate.
 *
 * Writes to `data/location-edits.jsonl` and `data/term-wikidata-map.json` are
 * curator-only operations. Outside of `NODE_ENV=development` the caller MUST
 * present the shared secret in `x-curation-token`. If the secret is not
 * configured in production, all writes are refused.
 */
export function checkCurationAuth(request: Request): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') return null;

  const expected = process.env.CURATION_AUTH_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'Curation API is disabled in this environment' },
      { status: 403 },
    );
  }

  const provided = request.headers.get('x-curation-token');
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

export const LOCATION_RESOLUTION_LEVELS = [
  'exact',
  'broader',
  'city',
  'country',
] as const;

export const LOCATION_EVIDENCE_SOURCES = [
  'trefwoord',
  'beschrijving',
  'both',
  'bevestigd',
  'revert',
  'rejected',
] as const;

export function isResolutionLevel(
  value: unknown,
): value is (typeof LOCATION_RESOLUTION_LEVELS)[number] {
  return (
    typeof value === 'string' &&
    (LOCATION_RESOLUTION_LEVELS as readonly string[]).includes(value)
  );
}

export function isEvidenceSource(
  value: unknown,
): value is (typeof LOCATION_EVIDENCE_SOURCES)[number] {
  return (
    typeof value === 'string' &&
    (LOCATION_EVIDENCE_SOURCES as readonly string[]).includes(value)
  );
}
