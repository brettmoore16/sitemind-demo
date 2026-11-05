import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { configuration, assert, HttpError } from './errors.mjs';
import { securityHeaders, readBody, jsonBody, sameOrigin, rateLimiter, cookies, sessionCookies, verifyTwilio, verifyStripe, secureEqual } from './security.mjs';
import { database, authenticate, workspace } from './database.mjs';
import { uuid, noteInput, workspaceInput, preferencesInput } from './validation.mjs';
import { proposeWithAI } from './ai.mjs';
import { smsCommand } from './messaging.mjs';
import { checkout, day13Reminder, canonicalStripeEvent } from './billing.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
// Explicit public files: backend, SQL, credentials, tests and docs cannot be served.
const publicFiles=new Set(['index.html','src/styles.css','src/app.js','src/state.js','src/parser.js','src/proposals.js','src/runtime.js']);
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
export function createApp({env=process.env,fetcher=fetch}={}) {
  const config=configuration(env), db=database(env,fetcher);
  const general=rateLimiter({limit:120}), loginLimit=rateLimiter({limit:10,windowMs:600000}), aiLimit=rateLimiter({limit:10,windowMs:600000});
  return async (req,res)=>{
    const requestId=randomUUID();res.setHeader('X-Request-ID',requestId);
    for(const [key,value] of Object.entries(securityHeaders))res.setHeader(key,value);
    if(config.secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
    const send=(status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(body));};
    try{
      const url=new URL(req.url,'http://localhost');const pathname=decodeURIComponent(url.pathname);
      if(!pathname.startsWith('/api/')){
        assert(req.method==='GET' || req.method==='HEAD',405,'Method not allowed');
        const file=pathname==='/'?'index.html':pathname.slice(1);
        assert(publicFiles.has(file),404,'Not found');
        const body=await readFile(path.join(root,file));res.writeHead(200,{'Content-Type':mime[path.extname(file)]+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:body);return;
      }
      general(req.socket.remoteAddress || 'unknown');
      if(pathname==='/api/config' && req.method==='GET'){send(200,{mode:config.mode,aiEnabled:config.mode==='service' && env.AI_ENABLED==='true',smsEnabled:false,billingEnabled:false});return;}
      assert(config.mode==='service',503,'This is a fictional local demo. Backend services are disabled.');
      if(pathname.startsWith('/api/webhooks/')){
        assert(req.method==='POST',405,'Method not allowed');
        const raw=await readBody(req,65536);
        if(pathname==='/api/webhooks/twilio'){
          // Validate against the configured external URL, never spoofable forwarding headers.
          assert(env.TWILIO_WEBHOOK_URL && verifyTwilio(env.TWILIO_WEBHOOK_URL,Object.fromEntries(new URLSearchParams(raw.toString())),req.headers['x-twilio-signature'],env.TWILIO_AUTH_TOKEN),403,'Invalid webhook signature');
          const params=Object.fromEntries(new URLSearchParams(raw.toString()));
          assert(/^SM[a-zA-Z0-9]{32}$/.test(params.MessageSid || '') && /^\+[1-9]\d{7,14}$/.test(params.From || '') && typeof params.Body==='string',400,'Invalid SMS payload');
          await db('/rest/v1/rpc/record_sms_webhook',{system:true,method:'POST',body:{p_sid:params.MessageSid,p_phone:params.From,p_command:smsCommand(params.Body),p_body:params.Body.slice(0,4000)}});
          // Empty TwiML never triggers an outbound (paid) SMS. STOP is recorded even while sending is off.
          res.writeHead(200,{'Content-Type':'text/xml'});res.end('<Response/>');return;
        }
        if(pathname==='/api/webhooks/stripe'){
          assert(env.BILLING_ENABLED==='true' && env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),503,'Billing webhooks are disabled');
          assert(verifyStripe(raw,req.headers['stripe-signature'],env.STRIPE_WEBHOOK_SECRET),403,'Invalid webhook signature');
          const event=jsonBody(raw);assert(event.livemode===false && typeof event.id==='string' && Number.isInteger(event.created) && event.data?.object,400,'Only valid test events are supported');
          await db('/rest/v1/rpc/record_stripe_event',{system:true,method:'POST',body:{p_event:await canonicalStripeEvent(event,env,fetcher)}});send(200,{received:true});return;
        }
        throw new HttpError(404,'Not found');
      }
      if(pathname==='/api/internal/trial-reminders'){
        assert(req.method==='POST',405,'Method not allowed');
        assert(env.BILLING_ENABLED==='true' && env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),503,'Trial jobs are disabled');
        assert(env.JOB_SECRET?.length>=32 && secureEqual(req.headers.authorization,'Bearer '+env.JOB_SECRET),403,'Invalid job authorization');
        const subscriptions=await db('/rest/v1/billing_accounts?status=eq.trialing',{system:true});let queued=0;
        for(const sub of subscriptions){const reminder=day13Reminder(sub);if(!reminder)continue;await db('/rest/v1/delivery_outbox',{system:true,method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:{idempotency_key:reminder.key,tenant_id:reminder.tenantId,kind:'trial-day13',payload:{message:reminder.message}}});queued++;}
        send(200,{eligible:queued,delivery:'queued_only_no_messages_sent'});return;
      }
      if(!['GET','HEAD'].includes(req.method))sameOrigin(req,config.origin);
      const parse=async(limit)=>jsonBody(await readBody(req,limit));
      if(pathname==='/api/auth/login' && req.method==='POST'){
        loginLimit(req.socket.remoteAddress || 'unknown');const body=await parse(2048);
        assert(typeof body.email==='string' && body.email.length<=254 && /^\S+@\S+\.\S+$/.test(body.email) && typeof body.password==='string' && body.password.length>=8 && body.password.length<=256,400,'Enter your email and password');
        let session;try{session=await db('/auth/v1/token?grant_type=password',{method:'POST',body:{email:body.email,password:body.password}});}catch{throw new HttpError(401,'Sign-in failed. Check your verified account credentials.');}
        assert(session.access_token && session.refresh_token,502,'Invalid authentication response');
        send(200,{signedIn:true},{'Set-Cookie':sessionCookies(session,config.secure)});return;
      }
      if(pathname==='/api/auth/refresh' && req.method==='POST'){
        loginLimit(req.socket.remoteAddress || 'unknown');const refresh=cookies(req).sm_refresh;assert(refresh,401,'Sign in again');
        const session=await db('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh}});
        assert(session.access_token && session.refresh_token,401,'Sign in again');send(200,{signedIn:true},{'Set-Cookie':sessionCookies(session,config.secure)});return;
      }
      if(pathname==='/api/auth/logout' && req.method==='POST'){
        const token=cookies(req).sm_access;if(token)await db('/auth/v1/logout?scope=local',{method:'POST',token}).catch(()=>{});
        send(200,{signedOut:true},{'Set-Cookie':sessionCookies({},config.secure,true)});return;
      }
      const session=await authenticate(req,db,cookies(req));const token=session.token;
      if(pathname==='/api/session' && req.method==='GET'){send(200,{user:{id:session.user.id,email:session.user.email}});return;}
      if(pathname==='/api/projects'){
        if(req.method==='GET'){send(200,await db('/rest/v1/projects?select=id,name,tenant_id,revision&order=created_at',{token}));return;}
        if(req.method==='POST'){const body=await parse(1024);assert(typeof body.name==='string' && body.name.trim().length>0 && body.name.length<=120,400,'Enter a project name');send(201,{id:await db('/rest/v1/rpc/bootstrap_workspace',{token,method:'POST',body:{p_name:body.name}})});return;}
      }
      const match=pathname.match(/^\/api\/projects\/([^/]+)\/(workspace|analyze|preferences|checkout)$/);
      assert(match,404,'Not found');const projectId=uuid(match[1]);const current=await workspace(db,token,projectId);
      if(match[2]==='workspace'){
        if(req.method==='GET'){send(200,current);return;}
        if(req.method==='PUT'){
          const body=await parse();const state=workspaceInput(body,current.state,session.user);
          const revision=await db('/rest/v1/rpc/apply_workspace',{token,method:'POST',body:{p_project:projectId,p_revision:body.revision,p_state:state}});
          send(200,{revision});return;
        }
      }
      if(match[2]==='analyze' && req.method==='POST'){
        aiLimit(session.user.id);const body=noteInput(await parse(8192));
        // Project context comes from an authorized database read, not browser assertions.
        const context={...current.state,activities:current.state.activities.slice(0,10)};
        assert(JSON.stringify(context).length<=100000,413,'Project context is too large for this initial AI testing phase');
        send(200,{proposals:await proposeWithAI({note:body.note,state:context,project:current.project,referenceDate:body.referenceDate,timezone:body.timezone,env,fetcher}),revision:current.revision});return;
      }
      if(match[2]==='preferences'){
        if(req.method==='GET'){const rows=await db(`/rest/v1/delivery_preferences?project_id=eq.${projectId}&user_id=eq.${session.user.id}`,{token});send(200,rows[0] || null);return;}
        if(req.method==='PUT'){const values=preferencesInput(await parse(2048));await db('/rest/v1/delivery_preferences?on_conflict=project_id,user_id',{token,method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{...values,project_id:projectId,user_id:session.user.id}});send(200,{saved:true,smsActive:false});return;}
      }
      if(match[2]==='checkout' && req.method==='POST'){
        const membership=await db(`/rest/v1/memberships?tenant_id=eq.${current.project.tenant_id}&user_id=eq.${session.user.id}`,{token});assert(membership[0]?.role==='owner',403,'Only a workspace owner can manage billing');
        const accounts=await db(`/rest/v1/billing_accounts?tenant_id=eq.${current.project.tenant_id}`,{token});assert(!accounts[0]?.stripe_subscription_id,409,'This workspace already used its initial subscription setup. Billing management is a later phase.');send(200,await checkout({env,userId:session.user.id,tenantId:current.project.tenant_id,customerId:accounts[0]?.stripe_customer_id,fetcher}));return;
      }
      throw new HttpError(405,'Method not allowed');
    }catch(error){
      const status=error instanceof HttpError?error.status:error instanceof URIError?400:500;
      // No raw error, body, tokens, provider output, or customer notes in logs/responses.
      send(status,{error:status===500?'Request failed. Reload the project before retrying a save.':error.message,code:error.code || 'request_failed',requestId});
    }
  };
}
