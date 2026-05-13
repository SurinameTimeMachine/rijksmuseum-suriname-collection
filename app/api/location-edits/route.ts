import {
  checkCurationAuth,
  isEvidenceSource,
  isResolutionLevel,
} from '@/lib/curation-api';
import {
  appendLocationEdit,
  getGeoFlags,
  normalizeWikidataReference,
} from '@/lib/location-curation';
import type { LocationEditRecord } from '@/types/collection';
import { NextResponse } from 'next/server';

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
  const authError = checkCurationAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);

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
  const objectnummer =
    typeof body.objectnummer === 'string' ? body.objectnummer.trim() : '';

  if (!author || !resolvedLocationLabel || !originalTerm || !objectnummer) {
    return NextResponse.json(
      {
        error:
          'author, objectnummer, originalTerm and resolvedLocationLabel are required',
      },
      { status: 400 },
    );
  }

  const recordnummer = Number(body.recordnummer);
  if (!Number.isFinite(recordnummer)) {
    return NextResponse.json(
      { error: 'recordnummer must be a finite number' },
      { status: 400 },
    );
  }

  if (!isResolutionLevel(body.resolutionLevel)) {
    return NextResponse.json(
      { error: 'resolutionLevel must be one of exact|broader|city|country' },
      { status: 400 },
    );
  }

  if (!isEvidenceSource(body.evidenceSource)) {
    return NextResponse.json(
      {
        error:
          'evidenceSource must be one of trefwoord|beschrijving|both|bevestigd|revert|rejected',
      },
      { status: 400 },
    );
  }

  const wikidataReference = normalizeWikidataReference(
    typeof body.wikidataReference === 'string' ? body.wikidataReference : '',
  );

  const record: LocationEditRecord = {
    recordnummer,
    objectnummer,
    originalTerm,
    resolvedLocationLabel,
    wikidataQid: wikidataReference.qid,
    wikidataUrl: wikidataReference.url,
    gazetteerUrl: asNullableUrl(body.gazetteerReference),
    lat: asNullableNumber(body.lat),
    lng: asNullableNumber(body.lng),
    resolutionLevel: body.resolutionLevel,
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
