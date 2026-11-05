import { assert } from './errors.mjs';
export function smsCommand(body) {
  const text=String(body || '').trim().toUpperCase();
  if(['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','REVOKE','OPTOUT'].includes(text))return 'stop';
  if(['START','UNSTOP','YES'].includes(text))return 'start';
  if(['HELP','INFO'].includes(text))return 'help';
  return 'note';
}
export function deliverySlot(preferences,date=new Date()) {
  if(!preferences.sms_opt_in || preferences.provider_opt_out || !preferences.phone_verified)return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:preferences.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  const time=parts.hour+':'+parts.minute;
  const slot=time===preferences.morning_time.slice(0,5)?'morning':time===preferences.evening_time.slice(0,5)?'evening':null;
  return slot?{slot,date:`${parts.year}-${parts.month}-${parts.day}`,idempotencyKey:`${preferences.user_id}:${preferences.project_id}:${parts.year}-${parts.month}-${parts.day}:${slot}`}:null;
}
export function dailyText(state,origin,projectId,slot) {
  const open=state.tasks.filter(i=>i.status!=='completed').length;
  const commitments=state.commitments.filter(i=>i.status!=='completed').length;
  const risks=state.risks.filter(i=>!i.resolved).length;
  // Links carry no login tokens and always require authentication.
  return `SiteMind ${slot}: ${open} open tasks, ${commitments} commitments, ${risks} risks. Review: ${origin}/?project=${encodeURIComponent(projectId)} Reply STOP to opt out.`;
}
export async function sendSms({env,to,body,consent,fetcher=fetch}) {
  assert(env.SMS_ENABLED==='true',503,'SMS sending is disabled');
  assert(consent?.sms_opt_in && consent.phone_verified && !consent.provider_opt_out,403,'Verified SMS consent is required');
  assert(/^\+[1-9]\d{7,14}$/.test(to) && typeof body==='string' && body.length<=480,400,'Invalid SMS');
  assert(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER,503,'SMS is not configured');
  const response=await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`,{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Basic '+Buffer.from(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:to,From:env.TWILIO_FROM_NUMBER,Body:body})});
  assert(response.ok,502,'The SMS provider could not send this message');
  return response.json();
}
