import { NextResponse } from 'next/server';

import {
  loadTermDefaults,
  normalizeWikidataReference,
  saveTermDefault,
} from '@/lib/location-curation';
import type {
  LocationResolutionLevel,
  TermDefault,
} from '@/types/collection';

export const runtime = 'nodejs';

export async function GET() {
  const defaults = loadTermDefaults();
  return NextResponse.json(Object.fromEntries(defaults));
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asNullableUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const term = typeof body.term === 'string' ? body.term.trim() : '';
  const author = typeof body.author === 'string' ? body.author.trim() : '';
  const resolvedLocationLabel =
    typeof body.resolvedLocationLabel === 'string'
      ? body.resolvedLocationLabel.trim()
      : '';

  if (!term || !author || !resolvedLocationLabel) {
    return NextResponse.json(
      { error: 'term, author and resolvedLocationLabel are required' },
      { status: 400 },
    );
  }

  const wikidataReference = normalizeWikidataReference(
    typeof body.wikidataReference === 'string' ? body.wikidataReference : '',
  );

  const entry: TermDefault = {
    term,
    resolvedLocationLabel,
    wikidataQid: wikidataReference.qid,
    wikidataUrl: wikidataReference.url,
    gazetteerUrl: asNullableUrl(body.gazetteerReference),
    lat: asNullableNumber(body.lat),
    lng: asNullableNumber(body.lng),
    resolutionLevel: body.resolutionLevel as LocationResolutionLevel,
    author,
    timestamp:
      typeof body.timestamp === 'string' && body.timestamp.trim()
        ? body.timestamp
        : new Date().toISOString(),
  };

  saveTermDefault(entry);

  return NextResponse.json({ ok: true, entry });
}
