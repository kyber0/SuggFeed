const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{let u;try{u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);}catch{return original(input,options);}if(['localhost','127.0.0.1','[::1]'].includes(u.hostname))return original(input,options);return Promise.reject(new Error('Audit sandbox blocked external network request'));};
