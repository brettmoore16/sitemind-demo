// Mocked service browser integration: no hosted accounts, keys, or provider calls.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
(async()=>{
 const {createApp}=await import('../backend/app.mjs');const {emptyWorkspace}=await import('../src/state.js');
 const project='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
 let state=emptyWorkspace(),revision=0,providerCalls=0;const calls=[];
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
 const env={APP_MODE:'service',APP_ORIGIN:'http://127.0.0.1:3003',SUPABASE_URL:'https://fictional.supabase.co',SUPABASE_ANON_KEY:'fictional-anon',AI_ENABLED:'true',OPENAI_API_KEY:'fictional-secret',OPENAI_MODEL:'gpt-4.1-mini'};
 const fetcher=async(url,options={})=>{
  calls.push(url);const body=options.body?JSON.parse(options.body):{};
  if(url.includes('/auth/v1/token'))return response({access_token:'fictional-access',refresh_token:'fictional-refresh',expires_in:3600});
  if(url.includes('/auth/v1/user'))return response({id:user,email:'demo@example.invalid',email_confirmed_at:'2026-01-01'});
  if(url.includes('/auth/v1/logout'))return new Response(null,{status:204});
  if(url.includes('/projects?'))return response([{id:project,name:'Fictional private project',tenant_id:project,revision}]);
  if(url.includes('/rpc/get_workspace'))return response({project:{id:project,name:'Fictional private project',tenant_id:project},revision,state});
  if(url.includes('/rpc/apply_workspace')){assert.equal(body.p_revision,revision);state=body.p_state;revision++;return response(revision);}
  if(url.includes('/delivery_preferences?'))return response([]);
  if(url==='https://api.openai.com/v1/responses'){
   providerCalls++;const values=[{action:'create',collection:'risks',targetId:'',title:'Fictional crane exclusion zone',detail:'Verify access control.',contractor:'',status:'pending',priority:'high',kind:'work',dueDate:'',dueTime:'',reason:'Safety risk'}, {action:'create',collection:'journal',targetId:'',title:'Fictional daily observation',detail:'Crew huddle held.',contractor:'',status:'pending',priority:'normal',kind:'followup',dueDate:'',dueTime:'',reason:'Site record'}];
   return response({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({proposals:values})}]}]});
  }
  throw Error('Unexpected mocked route '+url);
 };
 const server=http.createServer(createApp({env,fetcher}));await new Promise(resolve=>server.listen(3003,'127.0.0.1',resolve));
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const oldLocal=JSON.stringify({schemaVersion:2,tasks:[],commitments:[],events:[],reminders:[],risks:[],activities:[],readBriefings:{morning:false,evening:false}});
  await page.addInitScript(value=>{if(localStorage.getItem('sitemind-dashboard-v1')===null)localStorage.setItem('sitemind-dashboard-v1',value);},oldLocal);
  await page.goto(env.APP_ORIGIN);await page.locator('#account-dialog').waitFor({state:'visible'});
  await page.locator('#login-email').fill('demo@example.invalid');await page.locator('#login-password').fill('fictional-password');await page.locator('#login-form button[type=submit]').click();await page.locator('#account-dialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('#mode-label').textContent(),'PRIVATE WORKSPACE');assert.ok(!(await page.evaluate(()=>document.cookie)).includes('sm_access'));assert.equal(await page.locator('#task-list .task-row').count(),0);
  await page.locator('#add-task').click();await page.locator('#item-fields [name=title]').fill('Fictional cloud task');await page.locator('#item-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Item saved. Related items are unchanged.');
  assert.equal(state.tasks[0].title,'Fictional cloud task');assert.equal(await page.evaluate(()=>localStorage.getItem('sitemind-dashboard-v1')),oldLocal);
  await page.locator('#open-update').click();await page.locator('#entry-text').fill('Fictional crane risk; journal: crew huddle held.');await page.locator('#analysis-mode').selectOption('ai');await page.locator('#entry-submit').click();await page.locator('#review-dialog').waitFor({state:'visible'});
  assert.equal(providerCalls,1);assert.equal(state.risks.length,0);assert.equal(state.activities.length,0);
  await page.locator('#review-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Original note saved.'));
  assert.equal(state.risks.length,1);assert.equal(state.journal.length,1);assert.equal(state.activities[0].text,'Fictional crane risk; journal: crew huddle held.');
  const taskId=state.tasks[0].id;
  await page.locator('#open-update').click();await page.locator('#entry-text').fill('Correction: move the fictional cloud task to Thursday.');await page.locator('#entry-submit').click();
  await page.locator('#review-dialog').waitFor({state:'visible'});await page.locator('.proposal').first().locator('.include-proposal').check();
  await page.locator('.proposal').first().locator('[name=action]').selectOption('update');await page.locator('.proposal').first().locator('[name=targetId]').selectOption(taskId);
  await page.locator('.proposal').first().locator('[name=title]').fill('Fictional cloud task rescheduled');await page.locator('.proposal').first().locator('[name=status]').selectOption('confirmed');
  assert.equal(state.tasks[0].status,'pending');await page.locator('#review-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('1 corrected'));
  assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].id,taskId);assert.equal(state.tasks[0].status,'confirmed');assert.equal(providerCalls,1);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#project-title').textContent==='Fictional private project');assert.match(await page.locator('#journal-list').textContent(),/Fictional daily observation/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('sitemind-dashboard-v1')),oldLocal);
  const browserStorage=await page.evaluate(()=>JSON.stringify({...localStorage}));assert.ok(!browserStorage.includes('fictional-access'));assert.ok(!browserStorage.includes('Fictional cloud task'));
  assert.deepEqual(errors,[]);assert.ok(calls.every(url=>url.startsWith('https://fictional.supabase.co') || url==='https://api.openai.com/v1/responses'));
  console.log('PASS service browser: cookie login, authorized project load, confirmed saves, read-only AI preview, risk/journal creation, reload persistence, unchanged demo storage, no tokens/customer data in browser storage. All providers mocked.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exit(1)});
