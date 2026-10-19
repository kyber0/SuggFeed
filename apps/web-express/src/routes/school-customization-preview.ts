import {Router,type Request,type Response,type NextFunction} from 'express';
import {Eta} from 'eta';
import path from 'node:path';
import fs from 'node:fs';
import {authorizeSchoolStudio} from '../lib/school-customization-access';
import {normalizeCustomization} from '../lib/school-customization';
import {buildSchoolPreviewModel,PREVIEW_PAGES,PREVIEW_SCENARIOS} from '../lib/school-preview-model';
import {schoolHtml} from '../lib/school-path';
const router=Router();const paths=['/s/:schoolSlug/admin/customization','/platform/schools/:id/customization'];
const root=fs.existsSync(path.join(process.cwd(),'views'))?process.cwd():path.resolve(__dirname,'../..');
const eta=new Eta({views:path.join(root,'views'),cache:process.env.NODE_ENV==='production'});
const run=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
function options(value:Record<string,unknown>){const page=value.page||'home',scenario=value.scenario||'populated',theme=value.theme||'light',view=value.view||'board';
 if(!PREVIEW_PAGES.includes(page as any)||!PREVIEW_SCENARIOS.includes(scenario as any)||!['light','dark'].includes(String(theme))||!['board','tree','timeline','done'].includes(String(view)))throw Object.assign(new Error('Choose an available preview page and view.'),{status:400});return {page:String(page),scenario:String(scenario),theme:String(theme),view:String(view)};}
/** Trusted, escaped Eta output only. The studio deliberately ships no live action scripts. */
export function renderSchoolPreview(input:Parameters<typeof buildSchoolPreviewModel>[0],base:string,instanceId:string,revision=0){
 const model=buildSchoolPreviewModel(input);const disabledRoadmap=input.page==='roadmap'&&(!input.configuration.features.roadmap||input.scenario==='disabled');const template=disabledRoadmap?'school-message':input.page==='submit'?'home':input.page;if(disabledRoadmap)Object.assign(model,{title:'Roadmap is disabled',message:'This school has disabled the student roadmap. You can still browse community ideas.',nextHref:'/feed',nextLabel:'Browse ideas'});
 let html=schoolHtml(eta.render(template,model),model.schoolBase);
 html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'');
 html=html.replace(/<link\b[^>]*rel="manifest"[^>]*>/gi,'');
 html=html.replace(/<a\b[^>]*>/gi,tag=>tag.replace(/\shref="([^"]*)"/i,(_all,href:string)=>' href="#studio" data-studio-route="'+href+'"').replace(/\starget="[^"]*"/gi,''));
 html=html.replace(/<form\b[^>]*>/gi,tag=>tag.replace(/\saction="[^"]*"/gi,''));
 html=html.replace(/<input\b[^>]*type="file"[^>]*>/gi,tag=>tag.replace(/\sdisabled(?:="[^"]*")?/gi,'').replace(/\/?\s*>$/,' disabled>'));
 html=html.replace(new RegExp(model.schoolBase+'/branding/([a-f0-9-]{36})','gi'),base+'/assets/$1');
 html=html.replace(/data-theme="[^"]*"/,'data-theme="'+input.theme+'"').replace('<html lang="en"','<html data-text-size="compact" lang="en"');
 const data=JSON.stringify({instanceId,revision,base,schoolName:input.school.name,scenario:input.scenario,page:input.page,configuration:input.configuration}).replace(/</g,'\\u003c');
 return html.replace('</head>','<link rel="stylesheet" href="/css/school-studio.css?v=20261019-studio"/></head>').replace('</body>','<script type="application/json" id="school-studio-data">'+data+'</script><script defer src="/js/school-studio-frame.js?v=20261019-studio"></script></body>');
}
router.get(paths.map(p=>p+'/preview/content'),run(async(req,res)=>{
 const context=await authorizeSchoolStudio(req,res);if(!context)return;const value=options(req.query);const instance=String(req.query.instance||'');if(!/^[a-f0-9-]{36}$/i.test(instance))return res.status(400).send('Open this preview from the customization workspace.');
 const base=req.path.replace(/\/preview\/content$/,'');
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'; object-src 'none'");
 res.type('html').send(renderSchoolPreview({school:context.school,configuration:context.state.draft,...value},base,instance,context.state.revision));
}));
router.post(paths.map(p=>p+'/preview/render'),run(async(req,res)=>{
 const context=await authorizeSchoolStudio(req,res);if(!context)return;let configuration;try{configuration=normalizeCustomization(req.body?.configuration);}catch(error){return res.status(400).json({success:false,error:error instanceof Error?error.message:'Check the preview fields.'});}
 const value=options(req.body||{}),base=req.path.replace(/\/preview\/render$/,'');const html=renderSchoolPreview({school:context.school,configuration,...value},base,'00000000-0000-4000-8000-000000000000');
 res.setHeader('Cache-Control','private, no-store');res.json({success:true,html});
}));
export default router;
