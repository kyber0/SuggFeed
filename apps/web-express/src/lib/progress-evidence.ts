import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { supabase, supabaseService } from './supabase';
import { UUID } from './staff-workspace';
import { ProgressError } from './progress';
import { currentSchool } from './school-scope';
import { forEachActiveSchool } from './school-jobs';

export const EVIDENCE_BUCKET = 'idea-update-evidence';
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Evidence is raster-only. Also forbid libvips' SVG loader, even if type sniffing is bypassed.
sharp.block({ operation: ['VipsForeignLoadSvg'] });
export interface EvidenceFile {
  id: string; update_id?: string; display_name: string; mime_type: string;
  size_bytes: number; alt: string | null; href: string;
}
interface UploadRow {
  id: string; actor_id: string; request_id: string; update_id: string | null;
  display_name: string; declared_mime: string; declared_size: number; alt: string | null;
  temp_path: string; final_path: string; mime_type: string | null; size_bytes: number | null;
  state: string; expires_at: string;
}
function safeName(value: string): string {
  // Names are display text only, never object paths or raw HTTP headers.
  return value.replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim();
}
export function validateEvidence(input: unknown) {
  const b = input as Record<string, unknown>;
  if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.requestId !== 'string' || !UUID.test(b.requestId)) {
    throw new ProgressError(400, 'Start a new update before adding evidence.');
  }
  if (b.uploadId !== undefined && (typeof b.uploadId !== 'string' || !UUID.test(b.uploadId))) throw new ProgressError(400, 'Invalid evidence reservation.');
  if (typeof b.name !== 'string' || !safeName(b.name) || b.name.length > 120 ||
      typeof b.mime !== 'string' || !MIME_TYPES.includes(b.mime) ||
      typeof b.size !== 'number' || !Number.isInteger(b.size) || b.size < 1 || b.size > MAX_EVIDENCE_BYTES) {
    throw new ProgressError(400, 'Use a JPEG, PNG or WebP image up to 10 MB. New PDF uploads are paused until malware scanning is available.');
  }
  if (b.alt !== undefined && b.alt !== null && typeof b.alt !== 'string') throw new ProgressError(400, 'Describe the image in text.');
  const alt = typeof b.alt === 'string' ? b.alt.trim() || null : null;
  if ((b.mime !== 'application/pdf' && !alt) || (alt && alt.length > 200)) {
    throw new ProgressError(400, 'Add a description of 1–200 characters for each image.');
  }
  return { requestId: b.requestId, uploadId: typeof b.uploadId === 'string' ? b.uploadId : randomUUID(), name: safeName(b.name), mime: b.mime, size: b.size, alt };
}
function evidenceError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === '42501') throw new ProgressError(403, 'Staff access required, or this draft belongs to another account.');
  if (error.code === 'P0002') throw new ProgressError(404, 'Evidence not found.');
  if (error.code === '23505') throw new ProgressError(409, 'This reservation was used for a different file. Remove it and upload again.');
  if (error.code === '22023') throw new ProgressError(400, 'The evidence draft expired, was published, or exceeds five files. Remove unfinished files or start a new update.');
  throw error;
}
function evidencePath(row: {id:string}, path:string):string {
  const school=currentSchool();
  if(!school) throw new ProgressError(403,'School context required.');
  const prefix=school.id+'/'+row.id+'/';
  const legacy=school.slug==='demo' && path.startsWith(row.id+'/');
  const filename=path.slice(legacy ? row.id.length+1 : prefix.length);
  if(!UUID.test(row.id) || (!path.startsWith(prefix) && !legacy) || !/^(source|final\.(webp|pdf))$/.test(filename)) {
    throw new ProgressError(403,'Evidence belongs to another school.');
  }
  return path;
}
function fileMetadata(row: Record<string, any>): EvidenceFile {
  return { id: row.id, ...(row.update_id ? { update_id: row.update_id } : {}), display_name: row.display_name,
    mime_type: row.mime_type, size_bytes: row.size_bytes, alt: row.alt ?? null,
    href: `/s/${currentSchool()!.slug}/api/progress-evidence/${row.id}` };
}
export async function listPublicEvidence(submissionId: string): Promise<EvidenceFile[]> {
  const { data, error } = await supabase.rpc('read_public_idea_update_files', { p_submission_id: submissionId });
  if (error) throw error;
  return (data ?? []).map(fileMetadata);
}
export async function listStaffEvidence(submissionId: string, staffId: string): Promise<EvidenceFile[]> {
  const { data, error } = await supabaseService.rpc('read_staff_idea_update_files', { p_submission_id: submissionId, p_actor_id: staffId });
  evidenceError(error);
  return (data ?? []).map(fileMetadata);
}
/** Never accept a storage path from the browser. Authorization is rechecked in the database. */
async function authorizedFile(fileId: string, actorId: string | null): Promise<UploadRow> {
  if (!UUID.test(fileId)) throw new ProgressError(400, 'Invalid evidence ID.');
  const { data, error } = await supabaseService.rpc('read_authorized_progress_file', { p_file_id: fileId, p_actor_id: actorId });
  evidenceError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new ProgressError(404, 'Evidence not found.');
  if(row.temp_path) evidencePath(row,row.temp_path);
  if(row.final_path) evidencePath(row,row.final_path);
  return row;
}
export async function reserveEvidence(actorId: string, body: unknown) {
  const input = validateEvidence(body);
  const submissionId=(body as any)?.submissionId;
  if(submissionId!==undefined){
    if(!UUID.test(submissionId))throw new ProgressError(400,'Choose a valid submission for this evidence.');
    const bound=await supabaseService.rpc('bind_progress_draft',{p_actor_id:actorId,p_request_id:input.requestId,p_submission_id:submissionId});evidenceError(bound.error);
  }
  const { data, error } = await supabaseService.rpc('reserve_progress_upload', {
    p_actor_id: actorId, p_request_id: input.requestId, p_name: input.name,
    p_mime: input.mime, p_size: input.size, p_alt: input.alt,
    p_upload_id: input.uploadId,
  });
  evidenceError(error);
  const row = data as UploadRow;
  if (row.state === 'ready') return { file: { ...fileMetadata(row), state: 'ready' }, upload: null };
  const { data: upload, error: uploadError } = await supabaseService.storage.from(EVIDENCE_BUCKET)
    .createSignedUploadUrl(evidencePath(row,row.temp_path), { upsert: false });
  if (uploadError || !upload) {
    await supabaseService.rpc('cancel_progress_upload', { p_actor_id: actorId, p_file_id: row.id });
    throw new ProgressError(503, 'Evidence uploads are temporarily unavailable. Please try again.');
  }
  return { file: { id: row.id, display_name: row.display_name, declared_mime: row.declared_mime,
    declared_size: row.declared_size, alt: row.alt, state: row.state, expires_at: row.expires_at },
    upload: { signedUrl: upload.signedUrl, token: upload.token, path: upload.path } };
}
function detectedMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (/^%PDF-1\.[0-7]|^%PDF-2\.0/.test(bytes.subarray(0, 8).toString('ascii'))) return 'application/pdf';
  return null;
}
/** Images are decoded on the trusted server, bounded, oriented and re-encoded without original metadata. */
export async function validateEvidenceBytes(bytes: Buffer, declaredMime: string, declaredSize: number) {
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES || bytes.length !== declaredSize || detectedMime(bytes) !== declaredMime) {
    throw new ProgressError(400, 'The uploaded file does not match its declared type or size. Remove it and choose the original file again.');
  }
  if (declaredMime === 'application/pdf') {
    throw new ProgressError(400, 'New PDF evidence is paused until malware scanning is available.');
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 24_000_000, failOn: 'error', animated: false }).timeout({ seconds: 8 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
    const output = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer();
    if (output.length > MAX_EVIDENCE_BYTES) throw new Error('Output too large');
    return { bytes: output, mime: 'image/webp', extension: 'webp' };
  } catch {
    throw new ProgressError(400, 'Use a valid, non-animated image no larger than 24 megapixels.');
  }
}
export async function finalizeEvidence(actorId: string, fileId: string) {
  const row = await authorizedFile(fileId, actorId);
  if(row.declared_mime==='application/pdf')throw new ProgressError(400,'PDF evidence is quarantined. Remove it and choose an image.');
  if (row.actor_id !== actorId || !['pending', 'ready'].includes(row.state) || Date.parse(row.expires_at) <= Date.now()) {
    throw new ProgressError(400, 'This evidence draft expired or has already been published.');
  }
  if (row.state === 'ready') return { ...fileMetadata(row), state: row.state };
  const storage = supabaseService.storage.from(EVIDENCE_BUCKET);
  const { data: source, error: downloadError } = await storage.download(row.temp_path);
  if (downloadError || !source) throw new ProgressError(400, 'Upload the file before finalizing it.');
  const validated = await validateEvidenceBytes(Buffer.from(await source.arrayBuffer()), row.declared_mime, row.declared_size);
  const finalPath = evidencePath(row,row.final_path || `${currentSchool()!.id}/${row.id}/final.${validated.extension}`);
  const { error: writeError } = await storage.upload(finalPath, validated.bytes, {
    contentType: validated.mime, upsert: false, cacheControl: '0',
  });
  if (writeError) {
    const concurrent = await authorizedFile(fileId, actorId);
    if (concurrent.state === 'ready') return { ...fileMetadata(concurrent), state: concurrent.state };
    // A previous process can fail after writing. Never overwrite a final object; retry validation against it.
    if (!['Duplicate', '409'].includes(String((writeError as any).statusCode)) && !/already exists|duplicate/i.test(writeError.message)) {
      throw new ProgressError(503, 'Could not save the validated evidence. Please try again.');
    }
    const { data: existing, error: existingError } = await storage.download(finalPath);
    if (existingError || !existing || !Buffer.from(await existing.arrayBuffer()).equals(validated.bytes)) {
      throw new ProgressError(409, 'Evidence changed while uploading. Remove it and upload again.');
    }
  }
  const { data, error } = await supabaseService.rpc('finalize_progress_upload', {
    p_actor_id: actorId, p_file_id: fileId, p_path: finalPath, p_mime: validated.mime, p_size: validated.bytes.length,
  });
  evidenceError(error);
  // Original metadata-bearing source is private and no longer necessary. Retried by scheduled cleanup.
  await storage.remove([row.temp_path]);
  return { ...fileMetadata(data), state: data.state };
}
export async function cancelEvidence(actorId: string, fileId: string) {
  if (!UUID.test(fileId)) throw new ProgressError(400, 'Invalid evidence ID.');
  const { error } = await supabaseService.rpc('cancel_progress_upload', { p_actor_id: actorId, p_file_id: fileId });
  evidenceError(error);
  return { id: fileId, state: 'delete_pending' };
}
export async function evidenceDownload(fileId: string, actorId: string | null) {
  const row = await authorizedFile(fileId, actorId);
  if (!['ready', 'published'].includes(row.state) || !row.final_path || !row.mime_type) throw new ProgressError(404, 'Evidence not found.');
  if(row.mime_type==='application/pdf')throw new ProgressError(403,'PDF evidence is quarantined until malware scanning is available. Ask school staff for an image alternative.');
  const { data, error } = await supabaseService.storage.from(EVIDENCE_BUCKET).createSignedUrl(row.final_path, 60,
    row.mime_type === 'application/pdf' ? { download: safeName(row.display_name) } : {});
  if (error || !data) throw new ProgressError(503, 'Evidence downloads are temporarily unavailable.');
  return data.signedUrl;
}
export async function cleanupEvidence() {
  if(!currentSchool()) throw new ProgressError(403,'School context required.');
  const { data, error } = await supabaseService.rpc('claim_progress_upload_cleanup', { p_limit: 50 });
  if (error) throw error;
  let removed = 0; let failed = 0;
  for (const row of (data ?? []) as UploadRow[]) {
    try {
      const paths = [row.temp_path, row.final_path].filter((p): p is string => !!p).map(path=>evidencePath(row,path));
      const { error: removeError } = await supabaseService.storage.from(EVIDENCE_BUCKET).remove(paths);
      if (removeError) { failed++; continue; }
      const { error: finishError } = await supabaseService.rpc('finish_progress_upload_cleanup', { p_file_id: row.id });
      if (finishError) failed++; else removed++;
    } catch { failed++; }
  }
  // Source uploads from completed publications can be reintroduced until their upload token expires.
  const { data: sources, error: sourcesError } = await supabaseService.rpc('list_progress_sources_to_clean', { p_limit: 50 });
  if (sourcesError) throw sourcesError;
  for (const row of sources ?? []) {
    try {
      const { error: removeError } = await supabaseService.storage.from(EVIDENCE_BUCKET).remove([evidencePath(row,row.temp_path)]);
      if (removeError) { failed++; continue; }
      const { error: finishError } = await supabaseService.rpc('finish_progress_source_cleanup', { p_file_id: row.id });
      if (finishError) failed++;
    } catch { failed++; }
  }
  return { removed, failed };
}

export async function cleanupAllSchoolEvidence() {
  const result={removed:0,failed:0};
  const outcomes=await forEachActiveSchool(async()=>{
    const school=await cleanupEvidence();result.removed+=school.removed;result.failed+=school.failed;
  });
  return {...result,...outcomes,failed:result.failed+outcomes.failedSchools};
}
