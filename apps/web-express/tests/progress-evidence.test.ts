import { test as nodeTest } from 'node:test';
import { runWithSchool } from '../src/lib/school-scope';
const SCHOOL={id:'10000000-0000-4000-8000-000000000001',slug:'demo',name:'Demo',actorId:null,role:null};
const test=(name:string,fn:()=>void|Promise<void>)=>nodeTest(name,()=>runWithSchool(SCHOOL,fn));
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import evidenceRouter, { cleanupHandler } from '../src/routes/progress-evidence';
import { supabase, supabaseService, supabasePlatform } from '../src/lib/supabase';
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
  assert.throws(() => validateEvidence({ ...input, mime: 'application/pdf', alt: undefined }), /PDF uploads are paused/);
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
  await assert.rejects(() => validateEvidenceBytes(pdf, 'application/pdf', pdf.length), /PDF evidence is paused/);
  await assert.rejects(() => validateEvidenceBytes(pdf.subarray(0, 12), 'application/pdf', 12), ProgressError);
});

test('reservation only signs an opaque source path; finalize validates before ready, replay never overwrites final objects', async () => {
  const originalRpc = supabaseService.rpc; const originalStorage = supabaseService.storage.from;
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#dddddd' } }).png().toBuffer();
  const row: any = { id: fileId, request_id: requestId, actor_id: actorId, update_id: null,
    display_name: input.name, declared_mime: 'image/png', declared_size: png.length, alt: input.alt,
    temp_path: `${SCHOOL.id}/${fileId}/source`, final_path: `${SCHOOL.id}/${fileId}/final.webp`, state: 'pending',
    expires_at: new Date(Date.now() + 86400000).toISOString() };
  let uploaded = 0; let signed = 0;
  supabaseService.rpc = (async (name, args) => {
    if (name === 'reserve_progress_upload') { assert.equal(args.p_upload_id, fileId); return { data: { ...row }, error: null }; }
    if (name === 'read_authorized_progress_file') { assert.deepEqual(args, { p_file_id: fileId, p_actor_id: actorId }); return { data: [{ ...row }], error: null }; }
    if (name === 'finalize_progress_upload') {
      assert.equal(args.p_path, `${SCHOOL.id}/${fileId}/final.webp`); assert.equal(args.p_mime, 'image/webp');
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
    assert.equal(ready.href, `/s/demo/api/progress-evidence/${fileId}`); assert.equal(JSON.stringify(ready).includes('final_path'), false);
    await finalizeEvidence(actorId, fileId); assert.equal(uploaded, 1);
    assert.equal((await reserveEvidence(actorId, { ...input, size: png.length })).upload, null); assert.equal(signed, 1);
  } finally { supabaseService.rpc = originalRpc; supabaseService.storage.from = originalStorage; }
});

test('public evidence whitelists metadata, quarantines PDFs, and signs authorized images briefly', async () => {
  const originalAnonRpc = supabase.rpc; const originalRpc = supabaseService.rpc; const originalStorage = supabaseService.storage.from;
  let allowed = true;
  const row = { id: fileId, update_id: requestId, display_name: 'School report.pdf', mime_type: 'application/pdf', size_bytes: 40,
    alt: null, state: 'published', final_path: `${SCHOOL.id}/${fileId}/final.pdf`, temp_path: `${SCHOOL.id}/${fileId}/source`, actor_id: actorId };
  supabase.rpc = (async (name) => { assert.equal(name, 'read_public_idea_update_files'); return { data: [row], error: null }; }) as any;
  supabaseService.rpc = (async (name, args) => { assert.equal(name, 'read_authorized_progress_file'); assert.equal(args.p_actor_id, null); return { data: allowed ? [row] : [], error: null }; }) as any;
  supabaseService.storage.from = (() => ({ async createSignedUrl(path, seconds, options) {
    assert.equal(path, row.final_path); assert.equal(seconds, 60); assert.deepEqual(options, {});
    return { data: { signedUrl: 'https://storage.test/download' }, error: null };
  } })) as any;
  try {
    const files = await listPublicEvidence(actorId);
    assert.equal(JSON.stringify(files).includes('actor_id'), false); assert.equal(JSON.stringify(files).includes('final_path'), false);
    await assert.rejects(() => evidenceDownload(fileId, null), /quarantined/);
    row.mime_type='image/webp';row.final_path=`${SCHOOL.id}/${fileId}/final.webp`;
    assert.equal(await evidenceDownload(fileId, null), 'https://storage.test/download');
    allowed = false; await assert.rejects(() => evidenceDownload(fileId, null), error => error instanceof ProgressError && error.status === 404);
  } finally { supabase.rpc = originalAnonRpc; supabaseService.rpc = originalRpc; supabaseService.storage.from = originalStorage; }
});

test('cleanup only finishes successfully removed objects and retries failed deletions', async () => {
  const originalRpc = supabaseService.rpc; const originalStorage = supabaseService.storage.from;
  const finished: string[] = []; let attempts = 0;
  supabaseService.rpc = (async (name, args) => {
    if (name === 'claim_progress_upload_cleanup') return { data: [{ id: fileId, temp_path: `${SCHOOL.id}/${fileId}/source`, final_path: `${SCHOOL.id}/${fileId}/final.webp` }], error: null };
    if (name === 'finish_progress_upload_cleanup') { finished.push(args.p_file_id); return { error: null }; }
    if (name === 'list_progress_sources_to_clean') return { data: [], error: null };
    throw new Error('Unexpected RPC');
  }) as any;
  supabaseService.storage.from = (() => ({ async remove(paths) {
    assert.deepEqual(paths, [`${SCHOOL.id}/${fileId}/source`, `${SCHOOL.id}/${fileId}/final.webp`]); attempts++;
    return { error: attempts === 1 ? new Error('Storage failure') : null };
  } })) as any;
  try {
    assert.deepEqual(await cleanupEvidence(), { removed: 0, failed: 1 }); assert.deepEqual(finished, []);
    assert.deepEqual(await cleanupEvidence(), { removed: 1, failed: 0 }); assert.deepEqual(finished, [fileId]);
  } finally { supabaseService.rpc = originalRpc; supabaseService.storage.from = originalStorage; }
});

test('evidence routes require staff mutations, same-origin requests, UUIDs and a configured cleanup secret', async () => {
  const originalRpc = supabaseService.rpc; const originalSecret = process.env.CRON_SECRET,platformFrom=supabasePlatform.from;
  supabasePlatform.from=(()=>{const q:any={select(){return q;},not(){return q;},eq(){return q;},order(){return q;},async range(){return {error:null,data:[SCHOOL]};}};return q;}) as any;
  let role: string | null = null;
  supabaseService.rpc = (async (name) => {
    if (name === 'read_authorized_progress_file'||name==='read_public_progress_file') return { data: [], error: null };
    if (name === 'claim_progress_upload_cleanup' || name === 'list_progress_sources_to_clean') return { data: [], error: null };
    return { error: { code: '22023' } };
  }) as any;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { _res.locals.authAssurance='aal2';req.session = { user: role ? { id: actorId, role } : undefined } as any; runWithSchool({...SCHOOL,actorId:role?actorId:null,role:role as any},next); });
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
    assert.equal((await fetch(origin + '/internal/cleanup', { headers: { Authorization: 'Bearer local-test-secret' } })).status, 401);
    process.env.CRON_SECRET = 's'.repeat(40);
    assert.equal((await fetch(origin + '/internal/cleanup', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(origin + '/internal/cleanup', { headers: { Authorization: 'Bearer '+'s'.repeat(40) } })).status, 200);
  } finally {
    if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret;
    supabasePlatform.from=platformFrom;supabaseService.rpc = originalRpc; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('cleanup refuses another school path and continues after a thrown storage failure',async()=>{
 const rpc=supabaseService.rpc,storage=supabaseService.storage.from,removed:string[][]=[],finished:string[]=[];
 const ids=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003'];
 supabaseService.rpc=(async(name:string,args:any)=>{
  if(name==='claim_progress_upload_cleanup')return {error:null,data:[
   {id:ids[0],temp_path:`another-school/${ids[0]}/source`},
   {id:ids[1],temp_path:`${SCHOOL.id}/${ids[1]}/source`},
   {id:ids[2],temp_path:`${SCHOOL.id}/${ids[2]}/source`},
  ]};
  if(name==='finish_progress_upload_cleanup'){finished.push(args.p_file_id);return {error:null};}
  if(name==='list_progress_sources_to_clean')return {error:null,data:[]};
  throw new Error('Unexpected RPC');
 }) as any;
 supabaseService.storage.from=(()=>({async remove(paths:string[]){removed.push(paths);if(paths[0].includes(ids[1]))throw new Error('Network lost');return {error:null};}})) as any;
 try{assert.deepEqual(await cleanupEvidence(),{removed:1,failed:2});assert.deepEqual(finished,[ids[2]]);assert.equal(removed.length,2);}
 finally{supabaseService.rpc=rpc;supabaseService.storage.from=storage;}
});
test('evidence signing rejects another school and only the demo school can use preserved legacy paths',async()=>{
 const rpc=supabaseService.rpc,storage=supabaseService.storage.from;let path=`${fileId}/final.webp`,signed=0;
 supabaseService.rpc=(async()=>({error:null,data:[{id:fileId,final_path:path,state:'published',mime_type:'image/webp',display_name:'Evidence.webp'}]})) as any;
 supabaseService.storage.from=(()=>({async createSignedUrl(){signed++;return {error:null,data:{signedUrl:'https://storage.test/file'}};}})) as any;
 try {
  assert.equal(await evidenceDownload(fileId,null),'https://storage.test/file');
  await assert.rejects(()=>runWithSchool({...SCHOOL,slug:'other'},()=>evidenceDownload(fileId,null)),/another school/);
  path=`another-school/${fileId}/final.pdf`;await assert.rejects(()=>evidenceDownload(fileId,null),/another school/);
  path=`${SCHOOL.id}/${fileId}/../secret.pdf`;await assert.rejects(()=>evidenceDownload(fileId,null),/another school/);
  path=`${SCHOOL.id}/${fileId}/%2e%2e%2fsecret.pdf`;await assert.rejects(()=>evidenceDownload(fileId,null),/another school/);
  assert.equal(signed,1);
 }finally{supabaseService.rpc=rpc;supabaseService.storage.from=storage;}
});

test('public downloads do not require MFA but private evidence does before signing a URL',async()=>{
 const oldRpc=supabaseService.rpc,oldStorage=supabaseService.storage.from;let publicFile=true,assured=false,role='moderator',privateReads=0,signed=0;
 const row={id:fileId,actor_id:actorId,state:'published',mime_type:'image/webp',final_path:`${SCHOOL.id}/${fileId}/final.webp`,temp_path:`${SCHOOL.id}/${fileId}/source`};
 supabaseService.rpc=(async(name)=>{if(name==='read_public_progress_file')return {data:publicFile?[row]:[],error:null};if(name==='read_authorized_progress_file'){privateReads++;return {data:[row],error:null};}throw Error('Unexpected RPC');}) as any;
 supabaseService.storage.from=(()=>({async createSignedUrl(){signed++;return {data:{signedUrl:'https://storage.test/synthetic'},error:null};}})) as any;
 const app=express();app.use((req,res,next)=>{req.session={user:{id:actorId,role}} as any;res.locals.authAssurance=assured?'aal2':'aal1';runWithSchool({...SCHOOL,actorId,role:role as any},next);});app.use('/api/progress-evidence',evidenceRouter);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+(server.address() as any).port+'/api/progress-evidence/'+fileId;
 try{
  assert.equal((await fetch(url,{redirect:'manual'})).status,302);assert.equal(privateReads,0);assert.equal(signed,1);
  publicFile=false;const denied=await fetch(url,{redirect:'manual',headers:{Accept:'application/json'}});assert.equal(denied.status,403);assert.equal((await denied.json() as any).code,'MFA_REQUIRED');assert.equal(privateReads,0);assert.equal(signed,1);
  assured=true;assert.equal((await fetch(url,{redirect:'manual'})).status,302);assert.equal(privateReads,1);
  role='student';assert.equal((await fetch(url,{redirect:'manual'})).status,404);assert.equal(privateReads,1);
 }finally{supabaseService.rpc=oldRpc;supabaseService.storage.from=oldStorage;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
