import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, summary, validState, migrateState, addItem, setStatus, followUps, priorities, isDuplicate } from '../src/state.js';
const item=(title,extra={})=>({id:'test',title,detail:'',contractor:'',kind:'work',dueDate:'',dueTime:'',time:'',sourceNoteId:'',status:'pending',priority:'normal',...extra});
test('totals reflect independent explicit status changes',()=>{
 const state=initialState();assert.deepEqual(summary(state),{total:6,done:1,open:5,confirmed:1,risks:2,highRisks:1});
 setStatus(state,'tasks','t1','completed');setStatus(state,'commitments','c1','confirmed');state.risks[0].resolved=true;
 assert.deepEqual(summary(state),{total:6,done:2,open:4,confirmed:2,risks:1,highRisks:0});
});
test('v1 migration preserves user notes, tasks and confirmations',()=>{
 const legacy={tasks:[{id:'t',title:'User task',detail:'My detail',time:'9 AM',priority:'high',done:true}],commitments:[{id:'c',name:'Test Electric',text:'Rough in',contact:'Pat',confirmed:true}],risks:[],activities:[{id:'note',author:'User',initials:'U',text:'  Original\nnote  ',time:'Yesterday'}],readBriefings:{morning:true,evening:false}};
 const state=migrateState(legacy);assert.equal(state.tasks[0].status,'completed');assert.equal(state.commitments[0].status,'confirmed');assert.equal(state.activities[0].text,legacy.activities[0].text);assert.equal(state.tasks[0].detail,'My detail');assert.ok(validState(state));
 assert.equal(migrateState(state),state);
});
test('validation supports additions/deletions and rejects invalid persisted fields',()=>{
 const state=initialState();state.commitments=[];state.events=[];state.reminders=[];assert.ok(validState(JSON.parse(JSON.stringify(state))));assert.ok(!validState({tasks:[]}));
 state.tasks[0].status='finished-ish';assert.ok(!validState(state));
 state.tasks[0].status='pending';state.tasks[0].dueDate='2026-02-30';assert.ok(!validState(state));
});
test('follow-up completion never completes physical work sharing the source note',()=>{
 const state=initialState();state.tasks.push(item('Call Apex',{id:'follow',kind:'followup',sourceNoteId:'note'}));state.commitments.push(item('Deliver steel',{id:'work',sourceNoteId:'note',status:'confirmed'}));
 setStatus(state,'tasks','follow','completed');assert.equal(state.commitments.at(-1).status,'confirmed');assert.ok(!followUps(state).some(i=>i.id==='follow'));
 setStatus(state,'tasks','follow','pending');assert.ok(followUps(state).some(i=>i.id==='follow'));
});
test('deduplication ignores punctuation, case and polite filler, but preserves distinct dates',()=>{
 const state=initialState();assert.equal(addItem(state,'tasks',item('Inspect the rebar!',{dueDate:'2026-11-04'})),true);
 assert.ok(isDuplicate(state,'tasks',item('Please inspect rebar',{id:'new',dueDate:'2026-11-04'})));
 assert.equal(addItem(state,'tasks',item('inspect rebar',{id:'new',dueDate:'2026-11-04'})),false);
 assert.equal(addItem(state,'tasks',item('inspect rebar',{id:'next',dueDate:'2026-11-05'})),true);
 setStatus(state,'tasks','test','completed');assert.ok(isDuplicate(state,'tasks',item('Inspect rebar',{dueDate:'2026-11-04'})));
});
test('top three prioritizes high priority then earliest dates and excludes completed items',()=>{
 const state=initialState();state.tasks=[];state.commitments=[];state.events=[];state.reminders=[];
 state.tasks.push(item('Normal',{id:'n',dueDate:'2026-01-01'}),item('High later',{id:'h2',priority:'high',dueDate:'2026-12-02'}),item('High sooner',{id:'h1',priority:'high',dueDate:'2026-12-01'}),item('Done',{id:'d',status:'completed',priority:'high'}));
 assert.deepEqual(priorities(state).map(i=>i.id),['h1','h2','n']);
});
test('reset does not share mutable state',()=>{const first=initialState();first.tasks[0].status='completed';assert.equal(initialState().tasks[0].status,'pending');});
