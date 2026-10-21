(() => {
  function sfRememberVote(id:string,voted:boolean,count:number){
    try{const raw:unknown=JSON.parse(localStorage.getItem(sfSchoolKey('sf_voted_ideas'))||'[]');const ids=new Set<string>(Array.isArray(raw)?raw.filter((value):value is string=>typeof value==='string'):[]);if(voted)ids.add(id);else ids.delete(id);localStorage.setItem(sfSchoolKey('sf_voted_ideas'),JSON.stringify([...ids]));}catch{}
    for(const button of document.querySelectorAll<HTMLElement>('.sf-vote-btn[data-id],.action-like[data-id],[data-vote-id]')){
      if((button.dataset.voteId||button.dataset.id)!==id)continue;
      const state=button.matches('.sf-vote-btn')?'sf-vote-btn--voted':button.matches('.action-like')?'active':'is-voted';button.classList.toggle(state,voted);button.setAttribute('aria-pressed',String(voted));button.title=voted?'Undo your support':'Support this idea';button.setAttribute('aria-label',button.title);
      for(const number of button.querySelectorAll('.sf-vote-num,.action-count,.roadmap-card-vote-count,#roadmap-detail-votes'))number.textContent=String(count);
      const label=button.querySelector('.action-label');if(label)label.textContent=voted?'Supported':'Support';
      const card=button.closest<HTMLElement>('[data-votes]');if(card)card.dataset.votes=String(count);
    }
    document.dispatchEvent(new CustomEvent('sf:vote-changed',{detail:{id,voted,count}}));
  }
  Object.assign(window,{sfRememberVote});
  const requests = new WeakMap<HTMLButtonElement, AbortController>();
  const signedIn = () => !!document.getElementById('sf-auth-config')?.dataset.user;
  async function sync(button: HTMLButtonElement) {
    const id = button.dataset.followIdea;
    if (!id) return;
    requests.get(button)?.abort();
    button.textContent = signedIn() ? 'Loading follow status…' : 'Sign in to follow';
    button.disabled = signedIn();
    if (!signedIn()) return;
    const controller = new AbortController(); requests.set(button, controller);
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await sfSchoolFetch('/api/follows/' + encodeURIComponent(id), { signal: controller.signal });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error();
      if (button.dataset.followIdea !== id || requests.get(button) !== controller) return;
      button.dataset.following = String(body.following);
      button.setAttribute('aria-pressed', String(body.following));
      button.textContent = body.following ? 'Following · Unfollow' : 'Follow this idea';
    } catch {
      if (button.dataset.followIdea === id && requests.get(button) === controller) {
        button.textContent = 'Follow status unavailable · Retry';
        delete button.dataset.following;
      }
    } finally {
      clearTimeout(timer);
      if (requests.get(button) === controller) button.disabled = false;
    }
  }
  document.addEventListener('sf:follow-context', event => {
    const button = (event as CustomEvent<HTMLButtonElement>).detail;
    if (button) void sync(button);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-follow-idea]').forEach(button => { if (button.dataset.followIdea) void sync(button); });
  document.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-follow-idea]');
    if (!button || !button.dataset.followIdea || button.disabled) return;
    if (!signedIn()) { window.openAuthModal('signin'); return; }
    if (button.dataset.following === undefined) { void sync(button); return; }
    const id = button.dataset.followIdea;
    const following = button.dataset.following !== 'true';
    button.disabled = true;
    const controller = new AbortController(); requests.set(button, controller);
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await sfSchoolFetch('/api/follows/' + encodeURIComponent(id), { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ following }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error();
      if (button.dataset.followIdea !== id || requests.get(button) !== controller) return;
      button.dataset.following = String(result.following);
      button.setAttribute('aria-pressed', String(result.following));
      button.textContent = result.following ? 'Following · Unfollow' : 'Follow this idea';
    } catch {
      if (button.dataset.followIdea === id && requests.get(button) === controller) {
        delete button.dataset.following;
        button.textContent = 'Could not save · Check status again';
      }
    } finally { clearTimeout(timer); if (requests.get(button) === controller) button.disabled = false; }
  });
})();
