import {Router} from 'express';
import {currentSchool} from '../lib/school-scope';
import {supabasePlatform} from '../lib/supabase';
import {schoolPresentation} from '../lib/school-customization';
const router=Router();
router.get('/:id',async(req,res,next)=>{try{const school=currentSchool();if(!school||![schoolPresentation().logo,schoolPresentation().cover].includes(req.params.id))return res.sendStatus(404);const result=await supabasePlatform.from('school_brand_assets').select('storage_path').eq('school_id',school.id).eq('id',req.params.id).maybeSingle();if(result.error)throw result.error;if(!result.data)return res.sendStatus(404);const file=await supabasePlatform.storage.from('school-branding').download(result.data.storage_path);if(file.error||!file.data)return res.sendStatus(404);res.setHeader('Cache-Control','private, max-age=300');res.type('image/webp').send(Buffer.from(await file.data.arrayBuffer()));}catch(error){next(error);}});
export default router;
