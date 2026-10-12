import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import evidenceRouter, { cleanupHandler } from '../src/routes/progress-evidence';
import { supabase, supabaseService } from '../src/lib/supabase';
import { ProgressError } from '../src/lib/progress';
import { validateEvidence, validateEvidenceBytes, reserveEvidence, finalizeEvidence, evidenceDownload, listPublicEvidence, cleanupEvidence } from '../src/lib/progress-evidence';
import { sameOriginOnly } from '../src/lib/security';

const actorId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const fileId = '00000000-0000-4000-8000-000000000003';
const input = { requestId, uploadId: fileId, name: 'bench.png', mime: 'image/png', size: 100, alt: 'A new shaded bench outside the library.' };

test('evidence validates fixed types, 10MB size, image descriptions and display-only filenames', () => {
  assert.equal(validateEvidence(input).uploadId, fileId);
  assert.equal(validateEvidence({ ...input, name: '../bench.png' }).name, '.._bench.png');
  assert.equal(validateEvidence({ ...input, mime: 'application/pdf', alt: undefined }).alt, null);
  for (const change of [{ requestId: 'bad' }, { uploadId: 'bad' }, { name: '' }, { name: 'x'.repeat(121) },
    { mime: 'image/svg+xml' }, { size: 0 }, { size: 10485761 }, { size: '100' }, { alt: '' }, { alt: 'x'.repeat(201) }]) {
    assert.throws(() => validateEvidence({ ...input, ...change }), ProgressError);
  }
});

test('trusted image finalization strips metadata, bounds dimensions, and rejects spoofed/incomplete files', async () => {
  const source = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#f0f0f0' } })
    .withMetadata({ orientation: 1, exif: { IFD0: { Artist: 'PRIVATE STAFF', Copyright: 'PRIVATE LOCATION' } } }).png().toBuffer();
  const validated = await validateEvidenceBytes(source, 'image/png', source.length);
  assert.equal(validated.mime, 'image/webp');
  const metadata = await sharp(validated.bytes).metadata();
  assert.equal(metadata.width, 1600); assert.equal(metadata.height, 800);
  assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined);
  assert.equal(validated.bytes.includes(Buffer.from('PRIVATE')), false);
  await assert.rejects(() => validateEvidenceBytes(source, 'image/jpeg', source.length), ProgressError);
  await assert.rejects(() => validateEvidenceBytes(source, 'image/png', source.length - 1), ProgressError);
  await assert.rejects(() => validateEvidenceBytes(Buffer.from('<svg>bad</svg>'), 'image/png', 14), ProgressError);
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
  assert.equal((await validateEvidenceBytes(pdf, 'application/pdf', pdf.length)).mime, 'application/pdf');
  await assert.rejects(() => validateEvidenceBytes(pdf.subarray(0, 12), 'application/pdf', 12), ProgressError);
});

test('reservation only signs an opaque source path; finalize validates before ready, replay never overwrites final objects', async () => {
  const originalRpc = supabaseService.rpc; const originalStorage = supabaseService.storage.from;
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#dddddd' } }).png().toBuffer();
  const row: any = { id: fileId, request_id: requestId, actor_id: actorId, update_id: null,
    display_name: input.name, declared_mime: 'image/png', declared_size: png.length, alt: input.alt,
    temp_path: `${fileId}/source`, final_path: `${fileId}/final.webp`, state: 'pending',
    expires_at: new Date(Date.now() + 86400000).toISOString() };
  let uploaded = 0; let signed = 0;
  supabaseService.rpc = (async (name, args) => {
    if (name === 'reserve_progress_upload') { assert.equal(args.p_upload_id, fileId); return { data: { ...row }, error: null }; }
    if (name === 'read_authorized_progress_file') { assert.deepEqual(args, { p_file_id: fileId, p_actor_id: actorId }); return { data: [{ ...row }], error: null }; }
    if (name === 'finalize_progress_upload') {
      assert.equal(args.p_path, `${fileId}/final.webp`); assert.equal(args.p_mime, 'image/webp');
      assert.equal(uploaded, 1); row.state = 'ready'; row.mime_type = args.p_mime; row.size_bytes = args.p_size;
      return { data: { ...row }, error: null };
    }
    throw new Error('Unexpected RPC');
  }) as any;
  supabaseService.storage.from = (() => ({
    async createSignedUploadUrl(path, options) { signed++; assert.equal(path, row.temp_path); assert.equal(options.upsert, false); return { data: { signedUrl: 'https://storage.test/signed', token: 'opaque-token', path }, error: null }; },
    async download(path) { assert.equal(path, row.temp_path); return { data: new Blob([new Uint8Array(png)]), error: null }; },
    async upload(path, bytes, options) { uploaded++; assert.equal(path, row.final_path); assert.equal(options.upsert, false); assert.equal((await sharp(bytes).metadata()).format, 'webp'); return { error: null }; },
    async remove(paths) { assert.deepEqual(paths, [row.temp_path]); return { error: null }; },
  })) as any;
  try {
    const reserved = await reserveEvidence(actorId, { ...input, size: png.length });
    assert.equal(reserved.upload?.path, row.temp_path); assert.equal(JSON.stringify(reserved).includes('actor_id'), false);
    const ready = await finalizeEvidence(actorId, fileId); assert.equal(ready.state, 'ready');
    assert.equal(ready.href, `/api/progress-evidence/${fileId}`); assert.equal(JSON.stringify(ready).includes('final_path'), false);
    await finalizeEvidence(actorId, fileId); assert.equal(uploaded, 1);
    assert.equal((await reserveEvidence(actorId, { ...input, size: png.length })).upload, null); assert.equal(signed, 1);
  } finally { supabaseService.rpc = originalRpc; supabaseService.storage.from = originalStorage; }
});

test('public evidence whitelists metadata and download authorization uses a short-lived download-only PDF link', async () => {
  const originalAnonRpc = supabase.rpc; const originalRpc = supabaseService.rpc; const originalStorage = supabaseService.storage.from;
  let allowed = true;
  const row = { id: fileId, update_id: requestId, display_name: 'School report.pdf', mime_type: 'application/pdf', size_bytes: 40,
    alt: null, state: 'published', final_path: `${fileId}/final.pdf`, temp_path: `${fileId}/source`, actor_id: actorId };
  supabase.rpc = (async (name) => { assert.equal(name, 'read_public_idea_update_files'); return { data: [row], error: null }; }) as any;
  supabaseService.rpc = (async (name, args) => { assert.equal(name, 'read_authorized_progress_file'); assert.equal(args.p_actor_id, null); return { data: allowed ? [row] : [], error: null }; }) as any;
  supabaseService.storage.from = (() => ({ async createSignedUrl(path, seconds, options) {
    assert.equal(path, row.final_path); assert.equal(seconds, 60); assert.deepEqual(options, { download: row.display_name });
    return { data: { signedUrl: 'https://storage.test/download' }, error: null };
  } })) as any;
  try {
    const files = await listPublicEvidence(actorId);
    assert.equal(JSON.stringify(files).includes('actor_id'), false); assert.equal(JSON.stringify(files).includes('final_path'), false);
    assert.equal(await evidenceDownload(fileId, null), 'https://storage.test/download');
    allowed = false; await assert.rejects(() => evidenceDownload(fileId, null), error => error instanceof ProgressError && error.status === 404);
  } finally { supabase.rpc = originalAnonRpc; supabaseService.rpc = originalRpc; supabaseService.storage.from = originalStorage; }
});

test('cleanup only finishes successfully removed objects and retries failed deletions', async () => {
  const originalRpc = supabaseService.rpc; const originalStorage = supabaseService.storage.from;
  const finished: string[] = []; let attempts = 0;
  supabaseService.rpc = (async (name, args) => {
    if (name === 'claim_progress_upload_cleanup') return { data: [{ id: fileId, temp_path: `${fileId}/source`, final_path: `${fileId}/final.webp` }], error: null };
    if (name === 'finish_progress_upload_cleanup') { finished.push(args.p_file_id); return { error: null }; }
    if (name === 'list_progress_sources_to_clean') return { data: [], error: null };
    throw new Error('Unexpected RPC');
  }) as any;
  supabaseService.storage.from = (() => ({ async remove(paths) {
    assert.deepEqual(paths, [`${fileId}/source`, `${fileId}/final.webp`]); attempts++;
    return { error: attempts === 1 ? new Error('Storage failure') : null };
  } })) as any;
  try {
    assert.deepEqual(await cleanupEvidence(), { removed: 0, failed: 1 }); assert.deepEqual(finished, []);
    assert.deepEqual(await cleanupEvidence(), { removed: 1, failed: 0 }); assert.deepEqual(finished, [fileId]);
  } finally { supabaseService.rpc = originalRpc; supabaseService.storage.from = originalStorage; }
});

test('evidence routes require staff mutations, same-origin requests, UUIDs and a configured cleanup secret', async () => {
  const originalRpc = supabaseService.rpc; const originalSecret = process.env.CRON_SECRET;
  let role: string | null = null;
  supabaseService.rpc = (async (name) => {
    if (name === 'read_authorized_progress_file') return { data: [], error: null };
    if (name === 'claim_progress_upload_cleanup' || name === 'list_progress_sources_to_clean') return { data: [], error: null };
    return { error: { code: '22023' } };
  }) as any;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = { user: role ? { id: actorId, role } : undefined } as any; next(); });
  app.get('/internal/cleanup', cleanupHandler); app.use(sameOriginOnly); app.use('/api/evidence', evidenceRouter);
  app.use((_err, _req, res, _next) => res.status(500).json({ success: false, error: 'Unexpected error.' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const reserve = (source = origin) => fetch(origin + '/api/evidence/reserve', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: source }, body: JSON.stringify(input) });
  try {
    assert.equal((await reserve()).status, 401); role = 'student'; assert.equal((await reserve()).status, 403);
    role = 'moderator'; assert.equal((await reserve('https://attacker.test')).status, 403);
    const failed = await reserve(); assert.equal(failed.status, 400); assert.equal(failed.headers.get('cache-control'), 'private, no-store');
    assert.equal((await fetch(origin + '/api/evidence/bad')).status, 400);
    assert.equal((await fetch(origin + '/api/evidence/' + fileId)).status, 404);
    delete process.env.CRON_SECRET; assert.equal((await fetch(origin + '/internal/cleanup')).status, 401);
    process.env.CRON_SECRET = 'local-test-secret';
    assert.equal((await fetch(origin + '/internal/cleanup', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(origin + '/internal/cleanup', { headers: { Authorization: 'Bearer local-test-secret' } })).status, 200);
  } finally {
    if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret;
    supabaseService.rpc = originalRpc; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
