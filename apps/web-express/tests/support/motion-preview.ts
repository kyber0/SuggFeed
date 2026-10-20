// Standalone local fixtures; never imported by production routing.
import {createUIAuditPreview} from './ui-audit-preview';
import {renderSchoolPreview} from '../../src/routes/school-customization-preview';
import {customizationDefaults} from '../../src/lib/school-customization';
const app=createUIAuditPreview();
const configuration=customizationDefaults([{id:'00000000-0000-4000-8000-000000000099',name:'Campus',slug:'campus',description:'Fictional',icon:'building',active:true}]);
app.get('/__motion/preview',(_req,res)=>res.send(renderSchoolPreview({school:{id:'00000000-0000-4000-8000-000000000001',slug:'demo',name:'Fictional school'},configuration,page:'home',scenario:'populated',theme:'light'},'/__motion','00000000-0000-4000-8000-000000000001')));
if(require.main===module)app.listen(Number(process.env.MOTION_PORT)||4320,'127.0.0.1',()=>console.log('Local motion fixtures ready'));
export default app;
