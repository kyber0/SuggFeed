/** Information-only release: no private-record tool can be invoked. */
export const allowedTools:Readonly<Record<string,never>>=Object.freeze({});
export function invokeTool():never {throw new Error('Assistant tools are disabled');}
