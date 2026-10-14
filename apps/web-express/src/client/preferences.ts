(() => {
  const choices: Record<string, string[]> = { textSize: ['compact','comfortable'], theme: ['light','dark','system'], roadmapView: ['board','tree','timeline','done'] };
  const memory = new Map<string, string>();
  const read = (name: string): string | null => {
    if (!choices[name]) return null;
    try {
      const value: unknown = JSON.parse(localStorage.getItem('sf:preferences:v1:' + name) || 'null');
      if (value && typeof value === 'object' && 'version' in value && value.version === 1 &&
          'value' in value && typeof value.value === 'string' && choices[name].includes(value.value)) return value.value;
    } catch { /* Storage is optional. */ }
    return memory.get(name) || null;
  };
  const write = (name: string, value: string) => {
    if (!choices[name]?.includes(value)) return false;
    memory.set(name,value);
    try { localStorage.setItem('sf:preferences:v1:' + name, JSON.stringify({version:1,value})); return true; }
    catch { return false; }
  };
  Object.assign(window,{sfPreferences:{read,write}});
})();
