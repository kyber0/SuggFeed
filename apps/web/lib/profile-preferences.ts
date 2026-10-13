import { supabase } from './supabase';
export function anonymousDraftDefault(): boolean {
 try {return (localStorage.getItem('sf_anon_pref') ?? localStorage.getItem('cv_anon_pref')) !== 'false';}catch{return true;}
}
export async function saveProfilePreferences(userId:string|undefined,displayName:string,emailNotifications:boolean,anonymous:boolean) {
 const name=displayName.trim();if(name.length>60)throw new Error('Use a display name of up to 60 characters.');
 if(userId){const {error}=await supabase.from('profiles').update({display_name:name || null,email_notifications_enabled:emailNotifications}).eq('id',userId).select('id').single();if(error)throw new Error('Account preferences could not be saved. Please try again.');}
 try{localStorage.setItem('sf_display_name',name);localStorage.setItem('sf_anon_pref',String(anonymous));return {deviceSaved:true};}
 catch{if(userId)return {deviceSaved:false};throw new Error('Browser storage is unavailable. Device preferences were not saved.');}
}
