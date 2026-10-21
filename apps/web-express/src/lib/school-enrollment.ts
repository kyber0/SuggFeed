/** Email-only rosters; never accept role, account ID or school claims from this list. */
export function schoolRosterEmails(value: unknown): string[] {
 if(typeof value!=='string' || value.length>260000)throw new Error('Paste up to 1,000 email addresses, one per line.');
 const emails=new Set<string>();let first=true;
 for(const [index,line] of value.replace(/^\uFEFF/,'').split(/\r?\n/).entries()){
  let email=line.trim().toLowerCase();if(!email)continue;
  if(email.startsWith('"')&&email.endsWith('"'))email=email.slice(1,-1);
  if(first&&['email','email address','email_address'].includes(email)){first=false;continue;}first=false;
  if(email.length>254 || !/^[^\s@<>(),;"]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(email))throw new Error(`Check line ${index+1}. Enter one complete email address per line, with an optional Email heading and no names or extra columns.`);
  emails.add(email);
  // shortcut: 1,000 unique emails per school, use paged roster management before increasing this limit.
  if(emails.size>1000)throw new Error('This roster supports up to 1,000 unique email addresses. No changes were saved.');
 }
 return [...emails].sort();
}
