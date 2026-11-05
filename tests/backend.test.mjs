import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {createApp} from '../backend/app.mjs';
import {rateLimiter,verifyTwilio,verifyStripe,sessionCookies} from '../backend/security.mjs';
import {proposeWithAI} from '../backend/ai.mjs';
import {checkout,day13Reminder,canonicalStripeEvent} from '../backend/billing.mjs';
import {deliverySlot,smsCommand,sendSms,dailyText} from '../backend/messaging.mjs';
import {initialState,emptyWorkspace} from '../src/state.js';
import {workspaceInput} from '../backend/validation.mjs';
import {normalizeProposal,applyProposals} from '../src/proposals.js';
const projectId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const serviceEnv={APP_MODE:'service',APP_ORIGIN:'http://localhost:3000',SUPABASE_URL:'https://fictional.supabase.co',SUPABASE_ANON_KEY:'fictional-anon',SUPABASE_SERVICE_ROLE_KEY:'fictional-system'};
async function running(env,fetcher,callback){const server=http.createServer(createApp({env,fetcher}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await callback(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const candidate=()=>({action:'create',collection:'tasks',targetId:'',title:'Inspect rebar',detail:'Fictional inspection',contractor:'',status:'pending',priority:'normal',kind:'work',dueDate:'2026-11-05',dueTime:'09:00',reason:'Explicit task in note'});
const cookies={Cookie:'sm_access=fictional-session'};
const post={...cookies,Origin:serviceEnv.APP_ORIGIN,'Content-Type':'application/json'};
function fakeDatabase(current=initialState()){
 const calls=[];const fetcher=async(url,options={})=>{calls.push({url,options});const body=options.body?JSON.parse(options.body):{};
  if(url.includes('/auth/v1/user'))return json({id:userId,email:'demo@example.invalid',email_confirmed_at:'2026-01-01'});
  if(url.includes('/auth/v1/token'))return json({access_token:'fictional-session',refresh_token:'fictional-refresh',expires_in:3600});
  if(url.includes('/rpc/get_workspace'))return json(body.p_project===projectId?{project:{id:projectId,tenant_id:projectId,name:'Fictional project'},revision:2,state:current}:null);
  if(url.includes('/rpc/apply_workspace'))return body.p_revision===2?json(3):json({code:'40001'},409);
  if(url.includes('/projects?'))return json([{id:projectId,name:'Fictional project'}]);
  throw new Error('Unexpected provider route');
 };return {calls,fetcher};
}
test('demo serves explicit public assets only and disables backend without provider calls',async()=>{
 await running({},()=>{throw Error('No provider calls allowed')},async base=>{
  for(const file of ['/backend/app.mjs','/server.mjs','/.env.example','/tests/parser.test.js','/supabase/migrations/001_foundation.sql'])assert.equal((await fetch(base+file)).status,404,file);
  const response=await fetch(base+'/');assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.deepEqual(await (await fetch(base+'/api/config')).json(),{mode:'demo',aiEnabled:false,smsEnabled:false,billingEnabled:false});
  assert.equal((await fetch(base+'/api/projects')).status,503);
 });
});
test('service auth, origin checks, project isolation, confirmation and stale revisions',async()=>{
 const fake=fakeDatabase();await running(serviceEnv,fake.fetcher,async base=>{
  assert.equal((await fetch(base+'/api/projects')).status,401);
  assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:post,body:JSON.stringify({email:'demo@example.invalid',password:'fictional-password'})});
  assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);assert.ok(!(await login.text()).includes('fictional-session'));
  assert.equal((await fetch(base+'/api/projects/'+projectId+'/workspace',{headers:cookies})).status,200);
  const other='33333333-3333-4333-8333-333333333333';assert.equal((await fetch(base+'/api/projects/'+other+'/workspace',{headers:cookies})).status,404);
  const current=initialState();
  for(const confirmed of [false,undefined])assert.equal((await fetch(base+'/api/projects/'+projectId+'/workspace',{method:'PUT',headers:post,body:JSON.stringify({state:current,revision:2,confirmed})})).status,400);
  assert.equal((await fetch(base+'/api/projects/'+projectId+'/workspace',{method:'PUT',headers:post,body:JSON.stringify({state:current,revision:2,confirmed:true})})).status,200);
  assert.equal((await fetch(base+'/api/projects/'+projectId+'/workspace',{method:'PUT',headers:post,body:JSON.stringify({state:current,revision:1,confirmed:true})})).status,409);
  for(const call of fake.calls.filter(c=>c.url.includes('/rest/')))assert.equal(call.options.headers.Authorization,'Bearer fictional-session');
 });
});
test('server rejects modified original notes and missing source notes',()=>{
 const current=initialState();const next=structuredClone(current);next.activities[0].text='Changed original';assert.throws(()=>workspaceInput({state:next,revision:1,confirmed:true},current),/cannot be changed/);
 const missing=structuredClone(current);missing.tasks[0].sourceNoteId='missing';assert.throws(()=>workspaceInput({state:missing,revision:1,confirmed:true},current),/missing field note/);
});
test('server API checks do not expose keys in public config',async()=>{
 await running(serviceEnv,fakeDatabase().fetcher,async base=>{const text=await (await fetch(base+'/api/config')).text();assert.ok(!text.includes('fictional-anon'));assert.ok(!text.includes('fictional-system'));assert.equal((await fetch(base+'/api/projects/'+projectId+'/analyze',{method:'POST',headers:post,body:JSON.stringify({note:'Inspect rebar',referenceDate:'2026-11-05',timezone:'America/New_York'})})).status,503);});
});
test('AI structured output validates against server-side context and never writes',async()=>{
 let request;const values=[candidate()];const fetcher=async(url,options)=>{request={url,options};return json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({proposals:values})}]}]});};
 const state=initialState(), before=JSON.stringify(state);const args={note:'Inspect rebar tomorrow',state,project:{name:'Fictional'},referenceDate:'2026-11-04',timezone:'America/New_York',env:{AI_ENABLED:'true',OPENAI_API_KEY:'fictional-api-key',OPENAI_MODEL:'gpt-4.1-mini'},fetcher};
 const proposals=await proposeWithAI(args);assert.equal(proposals.length,1);assert.equal(JSON.stringify(state),before);assert.equal(request.url,'https://api.openai.com/v1/responses');const body=JSON.parse(request.options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.ok(!request.options.body.includes('fictional-api-key'));
 values[0]={...candidate(),action:'update',targetId:'unknown'};await assert.rejects(proposeWithAI(args),/invalid proposals/);
 values[0]={...candidate(),dueDate:'2026-02-30'};await assert.rejects(proposeWithAI(args),/invalid proposals/);
 values[0]={...candidate(),unexpected:'injected'};await assert.rejects(proposeWithAI(args),/invalid proposals/);
 await assert.rejects(proposeWithAI({...args,fetcher:async()=>json({status:'incomplete'})}),/incomplete/);
});
test('risk, journal and exact corrections apply atomically with no completion cascades',()=>{
 const state=initialState();const changes=[normalizeProposal({...candidate(),action:'update',targetId:'t2',title:state.tasks[1].title,status:'completed',kind:'followup'}),normalizeProposal({...candidate(),collection:'risks',title:'Unsafe access',priority:'high'}),normalizeProposal({...candidate(),collection:'journal',title:'Crew observation'})];
 const result=applyProposals(state,changes,'new-note');assert.equal(result.updated,1);assert.equal(result.state.tasks.find(i=>i.id==='t2').status,'completed');assert.equal(result.state.commitments[0].status,'pending');assert.equal(result.state.risks[0].title,'Unsafe access');assert.equal(result.state.journal[0].title,'Crew observation');assert.equal(state.risks.length,2);
 assert.throws(()=>applyProposals(state,[...changes,changes[0]],'note'),/Two corrections/);
});
test('session cookies are secure in HTTPS and limiter expires entries',()=>{
 assert.ok(sessionCookies({access_token:'a',refresh_token:'b'},true).every(c=>c.includes('Secure') && c.includes('HttpOnly')));
 let now=0;const limited=rateLimiter({limit:1,windowMs:10,now:()=>now});limited('u');assert.throws(()=>limited('u'),/Too many/);now=11;limited('u');
});
test('Twilio and Stripe signatures reject tampering and old webhook timestamps',()=>{
 const token='fictional-webhook-token',url='https://demo.invalid/api/webhooks/twilio',params={Body:'STOP',From:'+15555550100'};
 const signature=createHmac('sha1',token).update(url+'BodySTOPFrom+15555550100').digest('base64');assert.ok(verifyTwilio(url,params,signature,token));assert.ok(!verifyTwilio(url,{...params,Body:'START'},signature,token));assert.ok(!verifyTwilio('https://attacker.invalid',params,signature,token));
 const raw=Buffer.from('{"id":"evt_fictional"}'),time=1700000000,secret='fictional-stripe-signature';const hash=createHmac('sha256',secret).update(time+'.').update(raw).digest('hex');assert.ok(verifyStripe(raw,`t=${time},v1=${hash}`,secret,time*1000));assert.ok(!verifyStripe(raw,`t=${time},v1=${hash}`,secret,(time+301)*1000));assert.ok(!verifyStripe(Buffer.from('{}'),`t=${time},v1=${hash}`,secret,time*1000));
});
test('SMS opt-out overrides app consent; local delivery times and links contain no auth tokens',async()=>{
 assert.equal(smsCommand(' STOP '),'stop');assert.equal(smsCommand('START'),'start');
 const prefs={sms_opt_in:true,phone_verified:true,provider_opt_out:false,morning_time:'06:30:00',evening_time:'17:30:00',timezone:'America/New_York',user_id:userId,project_id:projectId};
 assert.equal(deliverySlot(prefs,new Date('2026-11-05T11:30:00Z')).slot,'morning');assert.equal(deliverySlot({...prefs,provider_opt_out:true},new Date('2026-11-05T11:30:00Z')),null);
 const body=dailyText(initialState(),'https://demo.invalid',projectId,'morning');assert.match(body,/Reply STOP/);assert.ok(!body.includes('token='));
 await assert.rejects(sendSms({env:{},consent:prefs,to:'+15555550100',body,fetcher:()=>{throw Error('No calls')}}),/disabled/);
});
test('Stripe is disabled by default; test checkout requires a payment method and 14-day trial',async()=>{
 const args={env:{},userId,tenantId:projectId,fetcher:()=>{throw Error('No calls')}};await assert.rejects(checkout(args),/disabled/);
 await assert.rejects(checkout({...args,env:{BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_fictional',STRIPE_PRICE_ID:'price_fictional'}}),/test mode/);
 let fields;await checkout({...args,env:{BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fictional',STRIPE_PRICE_ID:'price_fictional',APP_ORIGIN:'https://demo.invalid'},fetcher:async(url,options)=>{fields=new URLSearchParams(options.body);return json({url:'https://checkout.stripe.com/c/pay_fictional'});}});assert.equal(fields.get('payment_method_collection'),'always');assert.equal(fields.get('subscription_data[trial_period_days]'),'14');
 const sub={status:'trialing',trial_start:'2026-11-01T00:00:00Z',trial_end:'2026-11-15T00:00:00Z',stripe_subscription_id:'sub_fictional',tenant_id:projectId};assert.equal(day13Reminder(sub,new Date('2026-11-12')),null);assert.ok(day13Reminder(sub,new Date('2026-11-13')));assert.equal(day13Reminder(sub,new Date('2026-11-15')),null);
});

test('immutable notes allow PostgreSQL JSONB key ordering without allowing content changes',()=>{
 const current=initialState();const state=structuredClone(current);
 state.activities=state.activities.map(note=>Object.fromEntries(Object.entries(note).reverse()));
 assert.equal(workspaceInput({state,revision:1,confirmed:true},current),state);
});
test('Stripe event verification fetches canonical test subscription state',async()=>{
 const event={id:'evt_fictional',type:'customer.subscription.updated',data:{object:{id:'sub_fictional'}}};
 const result=await canonicalStripeEvent(event,{STRIPE_SECRET_KEY:'sk_test_fictional'},async()=>json({id:'sub_fictional',livemode:false,metadata:{tenant_id:projectId},status:'canceled'}));
 assert.equal(result.sitemind_subscription.status,'canceled');
 await assert.rejects(canonicalStripeEvent(event,{},async()=>json({id:'sub_fictional',livemode:true,metadata:{tenant_id:projectId}})),/Invalid test subscription/);
});
test('Twilio HTTP webhook validates the configured URL and logs STOP without sending an SMS',async()=>{
 const env={...serviceEnv,TWILIO_AUTH_TOKEN:'fictional-webhook-token',TWILIO_WEBHOOK_URL:'https://demo.invalid/api/webhooks/twilio'};const calls=[];
 const fake=async(url,options)=>{calls.push({url,options});return new Response(null,{status:204});};
 const params={MessageSid:'SM'+'0'.repeat(32),From:'+15555550100',Body:'STOP'};
 const signature=createHmac('sha1',env.TWILIO_AUTH_TOKEN).update(env.TWILIO_WEBHOOK_URL+Object.keys(params).sort().map(k=>k+params[k]).join('')).digest('base64');
 await running(env,fake,async base=>{
  assert.equal((await fetch(base+'/api/webhooks/twilio',{method:'POST',headers:{'x-twilio-signature':'forged'},body:new URLSearchParams(params)})).status,403);assert.equal(calls.length,0);
  const response=await fetch(base+'/api/webhooks/twilio',{method:'POST',headers:{'x-twilio-signature':signature,'x-forwarded-host':'attacker.invalid'},body:new URLSearchParams(params)});
  assert.equal(response.status,200);assert.equal(await response.text(),'<Response/>');assert.equal(calls.length,1);assert.ok(calls[0].url.includes('/rpc/record_sms_webhook'));assert.equal(JSON.parse(calls[0].options.body).p_command,'stop');
 });
});

test('status corrections retain the existing legacy display time',()=>{
 const state=initialState(),existing=state.tasks[1];
 const proposal=normalizeProposal({...existing,action:'update',targetId:existing.id,collection:'tasks',time:'',status:'completed'});
 const result=applyProposals(state,[proposal],'note');
 assert.equal(result.state.tasks.find(i=>i.id===existing.id).time,existing.time);
});
