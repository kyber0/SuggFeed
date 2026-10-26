// Static import guardrails start as warnings; --strict rejects violations after the baseline is accepted.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function inspectBoundaries(root){
 const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile()&&file.endsWith('.ts')&&!file.endsWith('.d.ts'))files.push(file);}}
 walk(path.join(root,'src'));const graph=new Map(files.map(file=>[file,new Set()])),findings=[];
 const relative=file=>path.relative(root,file).split(path.sep).join('/');
 for(const file of files){const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),specifiers=[];
  function visit(node){
   if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){const clause=node.importClause,named=clause?.namedBindings;const typesOnly=clause?.isTypeOnly||(!clause?.name&&named&&ts.isNamedImports(named)&&named.elements.length>0&&named.elements.every(item=>item.isTypeOnly));if(!typesOnly)specifiers.push(node.moduleSpecifier.text);}
   if(ts.isExportDeclaration(node)&&!node.isTypeOnly&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))specifiers.push(node.moduleSpecifier.text);
   if(ts.isImportEqualsDeclaration(node)&&!node.isTypeOnly&&ts.isExternalModuleReference(node.moduleReference)&&node.moduleReference.expression&&ts.isStringLiteral(node.moduleReference.expression))specifiers.push(node.moduleReference.expression.text);
   if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='require'&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))specifiers.push(node.arguments[0].text);
   ts.forEachChild(node,visit);
  }visit(source);
  for(const specifier of new Set(specifiers)){if(!specifier.startsWith('.'))continue;const target=path.resolve(path.dirname(file),specifier),from=relative(file),to=relative(target);
   if(from.startsWith('src/lib/')&&to.startsWith('src/routes/'))findings.push({kind:'layer',file:from,target:to});
   if(!from.startsWith('src/client/')&&to.startsWith('public/js/'))findings.push({kind:'generated',file:from,target:to});
   if(from.startsWith('src/client/')&&to.startsWith('src/')&&!to.startsWith('src/client/')&&!to.startsWith('src/contracts/'))findings.push({kind:'browser-server',file:from,target:to});
   const resolved=[target,target+'.ts',path.join(target,'index.ts')].find(value=>graph.has(value));if(resolved)graph.get(file).add(resolved);
  }
 }
 const visited=new Set(),active=new Set(),stack=[],seenCycles=new Set();
 function cycle(file){if(active.has(file)){const members=stack.slice(stack.indexOf(file)).map(relative),key=[...members].sort().join('|');if(!seenCycles.has(key)){seenCycles.add(key);findings.push({kind:'cycle',files:[...members,members[0]]});}return;}if(visited.has(file))return;visited.add(file);active.add(file);stack.push(file);for(const next of graph.get(file))cycle(next);stack.pop();active.delete(file);}
 for(const file of files)cycle(file);return findings;
}
module.exports={inspectBoundaries};
if(require.main===module){const findings=inspectBoundaries(path.join(__dirname,'..'));for(const finding of findings)console.warn('[boundary warning] '+JSON.stringify(finding));console.log('Static boundary findings: '+findings.length);if(findings.length&&process.argv.includes('--strict'))process.exitCode=1;}
