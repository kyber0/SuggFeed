import sharp,{type Metadata} from 'sharp';
import {supabasePlatform} from './supabase';
export async function reserveSchoolImage(input:{school:string;actor:string|null;owner:string;purpose:'logo'|'cover'|'submission';size:number}){
 if((process.env.CRON_SECRET?.length||0)<32)throw Object.assign(new Error('Image uploads are unavailable until scheduled cleanup is configured.'),{status:503});
 const result=await supabasePlatform.rpc('reserve_school_upload',{p_school:input.school,p_actor:input.actor,p_owner_hash:input.owner,p_purpose:input.purpose,p_size:input.size});
 if(result.error)throw Object.assign(new Error(result.error.code==='54000'?'Image upload limit reached. Try again later.':'This image upload is unavailable. Check school access and image size.'),{status:result.error.code==='54000'?429:400});
 const signed=await supabasePlatform.storage.from('school-upload-sources').createSignedUploadUrl(result.data.path);if(signed.error||!signed.data)throw Object.assign(new Error('Image upload could not start. Retry.'),{status:503});
 return {id:result.data.id,url:signed.data.signedUrl};
}
export async function finishSchoolImage(input:{school:string;actor:string|null;owner:string;id:string;purpose:'logo'|'cover'|'submission'}){
 const table=input.purpose==='submission'?'submission_uploads':'school_brand_assets';
 const existing=await supabasePlatform.from(table).select(input.purpose==='submission'?'id,owner_hash':'id,created_by').eq('school_id',input.school).eq('id',input.id).maybeSingle();if(existing.error)throw existing.error;
 if(existing.data){const row=existing.data as any;if(input.purpose==='submission'?row.owner_hash!==input.owner:row.created_by!==input.actor)throw Object.assign(new Error('Image owner changed.'),{status:403});return {id:input.id};}
 const intent=await supabasePlatform.from('school_upload_intents').select('id,declared_size,actor_id,purpose,expires_at').eq('school_id',input.school).eq('id',input.id).eq('owner_hash',input.owner).maybeSingle();
 if(intent.error)throw intent.error;if(!intent.data||intent.data.actor_id!==input.actor||intent.data.purpose!==input.purpose||Date.parse(intent.data.expires_at)<=Date.now())throw Object.assign(new Error('Image upload expired or changed owner. Upload it again.'),{status:409});
 const sourcePath=input.school+'/'+input.id,finalPath=sourcePath+'.webp';
 const source=await supabasePlatform.storage.from('school-upload-sources').download(sourcePath);if(source.error||!source.data)throw Object.assign(new Error('The uploaded image was not found. Choose it again.'),{status:409});
 const bytes=Buffer.from(await source.data.arrayBuffer());let output:Buffer,info:Metadata;
 try{
  if(bytes.length!==intent.data.declared_size||bytes.length>(input.purpose==='logo'?2:5)*1024*1024)throw new Error('Image size changed');
  const image=sharp(bytes,{limitInputPixels:40000000,animated:false,failOn:'error'}).timeout({seconds:8});const metadata=await image.metadata();if(!['png','jpeg','webp'].includes(metadata.format||'')||(metadata.pages||1)>1)throw new Error('Unsupported image');
  output=await image.rotate().resize(input.purpose==='logo'?512:input.purpose==='cover'?2400:1800,input.purpose==='logo'?512:input.purpose==='cover'?1200:1800,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();if(output.length>5242880)throw new Error('Processed image is too large');info=await sharp(output).metadata();
 }catch{await supabasePlatform.storage.from('school-upload-sources').remove([sourcePath]);throw Object.assign(new Error('Use a static PNG, JPEG or WebP image within the size limit. This file could not be processed.'),{status:400});}
 const bucket=input.purpose==='submission'?'submission-attachments':'school-branding';
 const uploaded=await supabasePlatform.storage.from(bucket).upload(finalPath,output,{contentType:'image/webp',upsert:false});if(uploaded.error&&String((uploaded.error as any).statusCode)!=='409')throw Object.assign(new Error('Image finalization is already in progress or failed. Retry.'),{status:409});
 const registered=await supabasePlatform.rpc('register_processed_school_upload',{p_school:input.school,p_actor:input.actor,p_owner_hash:input.owner,p_id:input.id,p_size:output.length,p_width:info.width,p_height:info.height});
 if(registered.error){const committed=await supabasePlatform.from(table).select('id').eq('school_id',input.school).eq('id',input.id).maybeSingle();if(committed.error||!committed.data)throw Object.assign(new Error('Image finalization could not be confirmed. Retry this upload before choosing another file.'),{status:409});}
 await supabasePlatform.storage.from('school-upload-sources').remove([sourcePath]);return {id:input.id};
}
