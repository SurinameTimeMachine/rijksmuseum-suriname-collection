import { NextResponse } from 'next/server';

import {
  appendLocationEdit,
  getGeoFlags,
  normalizeWikidataReference,
} from '@/lib/location-curation';
import type {
  LocationEditRecord,
  LocationResolutionLevel,
} from '@/types/collection';

export const runtime = 'nodejs';

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

  const author = typeof body.author === 'string' ? body.author.trim() : '';
  const resolvedLocationLabel =
    typeof body.resolvedLocationLabel === 'string'
      ? body.resolvedLocationLabel.trim()
      : '';
  const originalTerm =
    typeof body.originalTerm === 'string' ? body.originalTerm.trim() : '';

  if (!author || !resolvedLocationLabel || !originalTerm) {
    return NextResponse.json(
      { error: 'author, originalTerm and resolvedLocationLabel are required' },
      { status: 400 },
    );
  }

  const wikidataReference = normalizeWikidataReference(
    typeof body.wikidataReference === 'string' ? body.wikidataReference : '',
  );

  const record: LocationEditRecord = {
    recordnummer: Number(body.recordnummer),
    objectnummer:
      typeof body.objectnummer === 'string' ? body.objectnummer.trim() : '',
    originalTerm,
    resolvedLocationLabel,
    wikidataQid: wikidataReference.qid,
    wikidataUrl: wikidataReference.url,
    gazetteerUrl: asNullableUrl(body.gazetteerReference),
    lat: asNullableNumber(body.lat),
    lng: asNullableNumber(body.lng),
    resolutionLevel: body.resolutionLevel as LocationResolutionLevel,
    evidenceSource: body.evidenceSource,
    evidenceText:
      typeof body.evidenceText === 'string' && body.evidenceText.trim()
        ? body.evidenceText.trim()
        : null,
    author,
    timestamp:
      typeof body.timestamp === 'string' && body.timestamp.trim()
        ? body.timestamp
        : new Date().toISOString(),
    remark:
      typeof body.remark === 'string' && body.remark.trim()
        ? body.remark.trim()
        : null,
  };

  appendLocationEdit(record);

  return NextResponse.json({
    ok: true,
    record,
    flags: getGeoFlags(record.lat, record.lng),
  });
}