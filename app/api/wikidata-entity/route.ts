import { NextResponse } from 'next/server';

import { normalizeWikidataReference } from '@/lib/location-curation';

export const runtime = 'nodejs';

function getEntityLabel(entity: Record<string, unknown>): string | null {
  const labels = entity.labels as Record<string, { value: string }> | undefined;
  return labels?.nl?.value || labels?.en?.value || null;
}

function getCoordinates(entity: Record<string, unknown>) {
  const claims = entity.claims as Record<string, Array<Record<string, unknown>>> | undefined;
  const firstClaim = claims?.P625?.[0];
  const mainsnak = firstClaim?.mainsnak as {
    datavalue?: { value?: { latitude?: number; longitude?: number } };
  } | undefined;
  const value = mainsnak?.datavalue?.value;

  if (!value) {
    return { lat: null, lng: null };
  }

  return {
    lat: typeof value.latitude === 'number' ? value.latitude : null,
    lng: typeof value.longitude === 'number' ? value.longitude : null,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const ref = normalizeWikidataReference(query);

  if (!ref.qid) {
    return NextResponse.json(
      { error: 'Invalid QID or Wikidata URL' },
      { status: 400 },
    );
  }

  const response = await fetch(
    `https://www.wikidata.org/wiki/Special:EntityData/${ref.qid}.json`,
    {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch Wikidata entity' },
      { status: 502 },
    );
  }

  const data = await response.json();
  const entity = data.entities?.[ref.qid] as Record<string, unknown> | undefined;

  if (!entity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
  }

  const coords = getCoordinates(entity);

  return NextResponse.json({
    qid: ref.qid,
    url: ref.url,
    label: getEntityLabel(entity),
    ...coords,
  });
}