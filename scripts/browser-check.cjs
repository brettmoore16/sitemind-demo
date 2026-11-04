const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL || 'http://127.0.0.1:3001';
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
 const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-11-03T15:00:00Z'));page.setDefaultTimeout(10000);
 const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
 await page.goto(base);
 assert.equal(await page.locator('#priority-list .priority-card').count(),3);
 assert.equal(await page.locator('#task-list .task-row').count(),6);
 const original='  Apex will deliver steel tomorrow at 10 AM; remind me to call Apex Thursday; review RFI #42 next Monday; schedule the rebar inspection Thursday at 9 AM.\n  ';
 async function analyze(text){await page.locator('#open-update').click();await page.locator('#entry-text').fill(text);await page.locator('#entry-submit').click();await page.locator('#review-dialog').waitFor({state:'visible'});}
 await analyze(original);
 assert.equal(await page.locator('.proposal').count(),5);
 for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await page.locator('#review-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),`review overflow ${width}`);}
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('#review-note').textContent(),original);
 assert.equal(await page.locator('#task-list .task-row').count(),6);
 assert.equal(await page.locator('#activity-list .activity').count(),2);
 await page.locator('[data-close="review-dialog"]').click();await page.reload();
 assert.equal(await page.locator('#activity-list .activity').count(),2);
 await analyze(original);
 await page.locator('#review-form button[type=submit]').click();
 assert.equal(await page.locator('#task-list .task-row').count(),7);
 assert.equal(await page.locator('#event-list .schedule-item').count(),6);
 assert.equal(await page.locator('#reminder-list .task-row').count(),1);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('sitemind-dashboard-v1')));
 assert.equal(stored.activities[0].text,original);
 assert.equal(stored.commitments[0].dueDate,'2026-11-04');
 assert.equal(stored.tasks[0].dueDate,'2026-11-09');
 assert.equal(stored.reminders[0].dueDate,'2026-11-05');
 await page.locator('#followup-list input[data-collection=reminders]').click();
 let data=await page.evaluate(()=>JSON.parse(localStorage.getItem('sitemind-dashboard-v1')));
 assert.equal(data.reminders[0].status,'completed');assert.equal(data.commitments[0].status,'pending');assert.equal(data.events[0].status,'scheduled');
 await analyze(original);await page.locator('#review-form button[type=submit]').click();
 assert.equal(await page.locator('#task-list .task-row').count(),7);assert.equal(await page.locator('#event-list .schedule-item').count(),6);
 assert.match(await page.locator('#toast').textContent(),/5 duplicates skipped/);
 // Edit, duplicate blocking, explicit statuses, and deletion retain source notes.
 await page.locator('#task-list [data-edit]').first().click();
 await page.locator('#item-fields [name=title]').fill('Review RFI <script>alert(1)</script>');
 await page.locator('#item-fields [name=status]').selectOption('confirmed');
 await page.locator('#item-form button[type=submit]').click();
 assert.match(await page.locator('#task-list').textContent(),/Review RFI <script>alert\(1\)<\/script>/);
 assert.equal(await page.locator('#task-list script').count(),0);
 const beforeNotes=await page.locator('#activity-list .activity').count();
 page.once('dialog',d=>d.accept());await page.locator('#task-list [data-delete]').first().click();
 assert.equal(await page.locator('#task-list .task-row').count(),6);assert.equal(await page.locator('#activity-list .activity').count(),beforeNotes);
 // Manually add reminder, task, commitment, and event through the same validated editor.
 for(const key of ['tasks','commitments','events','reminders']){
  if(key==='tasks')await page.locator('#add-task').click();else await page.locator(`[data-add=${key}]`).first().click();
  await page.locator('#item-fields [name=title]').fill(`Manual ${key}`);
  await page.locator('#item-fields [name=dueDate]').fill('2026-11-12');
  await page.locator('#item-fields [name=status]').selectOption('scheduled');
  await page.locator('#item-form button[type=submit]').click();
 }
 // Edits/deletes work for each item type, without touching original notes.
 for(const [key,section] of [['commitments','#commitment-list'],['events','#event-list'],['reminders','#reminder-list']]){
  const row=page.locator(section).getByRole('button',{name:`Edit Manual ${key}`,exact:true});await row.click();
  await page.locator('#item-fields [name=status]').selectOption('completed');
  await page.locator('#item-form button[type=submit]').click();
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('sitemind-dashboard-v1')));
  assert.ok(snapshot[key].some(i=>i.title===`Manual ${key}` && i.status==='completed'));
  const notesBefore=await page.locator('#activity-list .activity').count();
  page.once('dialog',d=>d.accept());await page.locator(section).getByRole('button',{name:`Delete Manual ${key}`,exact:true}).click();
  assert.equal(await page.locator('#activity-list .activity').count(),notesBefore);
 }
 await page.locator('#add-task').click();await page.locator('#item-fields [name=title]').fill('Manual tasks');
 await page.locator('#item-fields [name=dueDate]').fill('2026-11-12');
 await page.locator('#item-form button[type=submit]').click();
 assert.match(await page.locator('#toast').textContent(),/already exists/);
 assert.equal(await page.locator('#item-dialog').isVisible(),true);
 await page.locator('[data-close=item-dialog]').click();
 // Proposal review edits + excluded empty row cannot block save.
 await analyze('Install drywall tomorrow');
 await page.locator('.proposal [name=title]').fill('Install drywall east wing');
 await page.locator('.proposal [name=dueDate]').fill('2026-11-13');
 await page.locator('#add-proposal').click();
 await page.locator('.proposal').last().locator('.include-proposal').uncheck();
 await page.locator('#add-proposal').click();
 await page.locator('.proposal').last().locator('.include-proposal').uncheck();
 await page.locator('#review-form button[type=submit]').click();
 await page.locator('#review-dialog').waitFor({state:'hidden'});
 data=await page.evaluate(()=>JSON.parse(localStorage.getItem('sitemind-dashboard-v1')));
 assert.ok(data.tasks.some(t=>t.title==='Install drywall east wing' && t.dueDate==='2026-11-13'));
 // Save a note without accepting any proposals.
 await analyze('General observation from the field');await page.locator('.include-proposal').uncheck();await page.locator('#review-form button[type=submit]').click();
 await page.reload();assert.match(await page.locator('#activity-list').textContent(),/General observation/);
 await page.locator('[data-filter=done]').click();assert.equal(await page.locator('#task-list .task-row').count(),1);
 await page.locator('[data-filter=all]').click();
 for(const width of [320,375,390,768,1024,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);}
 await page.setViewportSize({width:390,height:844});
 await page.setViewportSize({width:1440,height:1050});
 // Migration through the real browser loader.
 const migration=await context.newPage();await migration.goto(base);
 await migration.evaluate(()=>localStorage.setItem('sitemind-dashboard-v1',JSON.stringify({tasks:[{id:'old',title:'Keep my task',detail:'Saved before upgrade',time:'9 AM',priority:'high',done:false}],commitments:[],risks:[],activities:[{id:'note',author:'Me',initials:'M',text:'Original old note',time:'Before upgrade'}],readBriefings:{morning:true,evening:false}})));
 await migration.reload();assert.match(await migration.locator('#task-list').textContent(),/Keep my task/);assert.match(await migration.locator('#activity-list').textContent(),/Original old note/);
 const unavailable=await browser.newContext();await unavailable.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('Blocked')}}));const blocked=await unavailable.newPage();await blocked.goto(base);await blocked.locator('#task-list input').first().check();assert.match(await blocked.locator('#storage-status').textContent(),/Session only/);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS browser: review/cancel/confirm, exact note retention, relative dates, all item types, duplicates, edit/delete, explicit statuses, isolated follow-up completion, priorities/counts, persistence/migration, excluded proposals, note-only save, six responsive widths, blocked storage, escaped content, no external requests/errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
