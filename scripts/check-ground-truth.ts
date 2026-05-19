import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

type GroundTruthManifest = {
  approvedCommitShas: string[];
  canonicalFiles: string[];
  locationEditsPath?: string;
};

type DriftFailure = {
  file: string;
  currentHash: string;
  approved: Array<{ commit: string; hash: string }>;
};

type LocationEditConflict = {
  key: string;
  timestamp: string;
  line: number;
};

const ROOT_DIR = process.cwd();
const MANIFEST_PATH = path.join(ROOT_DIR, 'ground-truth.snapshots.json');

function sha256(input: Buffer | string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function readManifest(): GroundTruthManifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Ground truth manifest missing: ${MANIFEST_PATH}`);
  }

  const manifest = JSON.parse(
    fs.readFileSync(MANIFEST_PATH, 'utf-8'),
  ) as GroundTruthManifest;

  if (
    !Array.isArray(manifest.approvedCommitShas) ||
    manifest.approvedCommitShas.length === 0
  ) {
    throw new Error('Manifest requires at least one approvedCommitShas entry.');
  }

  if (
    !Array.isArray(manifest.canonicalFiles) ||
    manifest.canonicalFiles.length === 0
  ) {
    throw new Error('Manifest requires at least one canonicalFiles entry.');
  }

  return manifest;
}

function gitCommitExists(commitSha: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${commitSha}^{commit}`], {
      cwd: ROOT_DIR,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function gitShowFile(commitSha: string, filePath: string): Buffer | null {
  try {
    return execFileSync('git', ['show', `${commitSha}:${filePath}`], {
      cwd: ROOT_DIR,
      encoding: 'buffer',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function checkCanonicalFiles(manifest: GroundTruthManifest): DriftFailure[] {
  const failures: DriftFailure[] = [];

  for (const rawFilePath of manifest.canonicalFiles) {
    const filePath = toPosixPath(rawFilePath);
    const absolutePath = path.join(ROOT_DIR, filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Canonical file is missing in workspace: ${filePath}`);
    }

    const currentHash = sha256(fs.readFileSync(absolutePath));
    const approvedHashes: Array<{ commit: string; hash: string }> = [];

    for (const commitSha of manifest.approvedCommitShas) {
      const blob = gitShowFile(commitSha, filePath);
      if (!blob) continue;
      approvedHashes.push({ commit: commitSha, hash: sha256(blob) });
    }

    if (approvedHashes.length === 0) {
      throw new Error(
        `No approved snapshot content found for ${filePath}. Check commit/file availability in manifest.`,
      );
    }

    const isApproved = approvedHashes.some(
      (entry) => entry.hash === currentHash,
    );
    if (!isApproved) {
      failures.push({
        file: filePath,
        currentHash,
        approved: approvedHashes,
      });
    }
  }

  return failures;
}

function stableEditPayloadHash(entry: Record<string, unknown>): string {
  const payload = {
    resolvedLocationLabel: entry.resolvedLocationLabel ?? null,
    wikidataQid: entry.wikidataQid ?? null,
    wikidataUrl: entry.wikidataUrl ?? null,
    gazetteerUrl: entry.gazetteerUrl ?? null,
    lat: entry.lat ?? null,
    lng: entry.lng ?? null,
    resolutionLevel: entry.resolutionLevel ?? null,
    evidenceSource: entry.evidenceSource ?? null,
    evidenceText: entry.evidenceText ?? null,
    remark: entry.remark ?? null,
  };

  return sha256(JSON.stringify(payload));
}

function validateLocationEdits(filePath: string): {
  conflicts: LocationEditConflict[];
  duplicateLineCount: number;
} {
  const absolutePath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Location edits file missing: ${filePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const perKeyTimestamp = new Map<string, Map<string, string>>();
  const latestByKey = new Map<
    string,
    { timestamp: number; payloadHash: string }
  >();
  const rawLineHashes = new Set<string>();
  let duplicateLineCount = 0;
  const conflicts: LocationEditConflict[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const lineHash = sha256(rawLine);
    if (rawLineHashes.has(lineHash)) {
      duplicateLineCount++;
    } else {
      rawLineHashes.add(lineHash);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawLine) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON in ${filePath} at line ${i + 1}`);
    }

    const recordnummer = String(parsed.recordnummer ?? '').trim();
    const originalTerm = String(parsed.originalTerm ?? '')
      .trim()
      .toLowerCase();
    const timestamp = String(parsed.timestamp ?? '').trim();

    if (!recordnummer || !originalTerm || !timestamp) {
      throw new Error(
        `Missing required key fields (recordnummer/originalTerm/timestamp) in ${filePath} at line ${i + 1}`,
      );
    }

    const timestampMs = Date.parse(timestamp);
    if (!Number.isFinite(timestampMs)) {
      throw new Error(
        `Invalid timestamp in ${filePath} at line ${i + 1}: ${timestamp}`,
      );
    }

    const key = `${recordnummer}::${originalTerm}`;
    const payloadHash = stableEditPayloadHash(parsed);

    if (!perKeyTimestamp.has(key)) {
      perKeyTimestamp.set(key, new Map());
    }
    const seenAtTimestamp = perKeyTimestamp.get(key)!;
    const existingPayload = seenAtTimestamp.get(timestamp);
    if (existingPayload && existingPayload !== payloadHash) {
      conflicts.push({ key, timestamp, line: i + 1 });
    } else {
      seenAtTimestamp.set(timestamp, payloadHash);
    }

    const latest = latestByKey.get(key);
    if (!latest || timestampMs > latest.timestamp) {
      latestByKey.set(key, { timestamp: timestampMs, payloadHash });
    } else if (
      timestampMs === latest.timestamp &&
      latest.payloadHash !== payloadHash
    ) {
      conflicts.push({ key, timestamp, line: i + 1 });
    }
  }

  return { conflicts, duplicateLineCount };
}

function main() {
  const manifest = readManifest();
  const missingCommits = manifest.approvedCommitShas.filter(
    (sha) => !gitCommitExists(sha),
  );

  if (missingCommits.length > 0) {
    throw new Error(
      `Approved commit(s) not available locally: ${missingCommits.join(', ')}. Fetch full history before running this check.`,
    );
  }

  const driftFailures = checkCanonicalFiles(manifest);

  const locationEditsPath =
    manifest.locationEditsPath || 'data/location-edits.jsonl';
  const locationValidation = validateLocationEdits(locationEditsPath);

  if (locationValidation.duplicateLineCount > 0) {
    console.warn(
      `Warning: ${locationValidation.duplicateLineCount} exact duplicate line(s) found in ${locationEditsPath}`,
    );
  }

  if (locationValidation.conflicts.length > 0) {
    console.error('\nLocation edit conflicts detected:');
    for (const conflict of locationValidation.conflicts.slice(0, 20)) {
      console.error(
        ` - key=${conflict.key}, timestamp=${conflict.timestamp}, line=${conflict.line}`,
      );
    }
    if (locationValidation.conflicts.length > 20) {
      console.error(
        ` - ... and ${locationValidation.conflicts.length - 20} more`,
      );
    }
    process.exit(1);
  }

  if (driftFailures.length > 0) {
    console.error('\nGround truth drift detected:');

    for (const failure of driftFailures) {
      console.error(`\nFile: ${failure.file}`);
      console.error(`Current: ${failure.currentHash}`);
      for (const approved of failure.approved) {
        console.error(`Approved (${approved.commit}): ${approved.hash}`);
      }
    }

    console.error(
      '\nIf this change is intentional, update ground-truth.snapshots.json with a newly approved commit snapshot.',
    );
    process.exit(1);
  }

  console.log(
    'Ground truth check passed: canonical files match approved snapshot commit(s).',
  );
}

main();
