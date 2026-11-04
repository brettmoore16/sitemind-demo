import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWhen,analyzeNote} from '../src/parser.js';
const reference=new Date(2026,10,3,10); // Tuesday, local calendar.
test('relative dates, weekday rollover and clock times',()=>{
 for(const [text,date,time] of [['tomorrow at 7 AM','2026-11-04','07:00'],['Thursday at 2:30 pm','2026-11-05','14:30'],['next Monday at noon','2026-11-09','12:00'],['Tuesday','2026-11-03',''],['next Tuesday','2026-11-10',''],['day after tomorrow','2026-11-05',''],['in 3 days by 16:00','2026-11-06','16:00'],['2026-12-01 at midnight','2026-12-01','00:00']]){
  const result=parseWhen(text,reference);assert.equal(result.dueDate,date,text);assert.equal(result.dueTime,time,text);
 }
 assert.equal(parseWhen('tomorrow',new Date(2026,11,31)).dueDate,'2027-01-01');
 assert.match(parseWhen('next week',reference).warning,/Ambiguous/);
 assert.equal(parseWhen('2026-02-30',reference).dueDate,'');
});
test('one message yields independent commitments, events, tasks and reminders',()=>{
 const result=analyzeNote('Apex will deliver steel tomorrow at 10 AM; remind me to call Apex Thursday; review RFI #42 next Monday. Schedule the rebar inspection Thursday at 9 AM.',reference);
 assert.ok(result.some(i=>i.collection==='commitments' && i.contractor==='Apex Steel' && i.dueDate==='2026-11-04'));
 assert.equal(result.filter(i=>i.collection==='events').length,2);
 assert.ok(result.some(i=>i.collection==='reminders' && i.kind==='followup' && i.dueDate==='2026-11-05'));
 assert.ok(result.some(i=>i.collection==='tasks' && i.title.includes('RFI') && i.dueDate==='2026-11-09'));
 assert.ok(result.every(i=>i.status!=='completed' && i.status!=='confirmed'));
});
test('construction terminology, multi-action conjunctions and trade commitments',()=>{
 const result=analyzeNote('Electrician will finish rough-in Thursday and remind me to verify the submittal tomorrow; HVAC crew will install ductwork next Monday; check the punch list; install formwork and rebar tomorrow.',reference);
 assert.equal(result.filter(i=>i.collection==='commitments').length,2);
 assert.ok(result.some(i=>i.collection==='reminders'));
 assert.ok(result.some(i=>i.kind==='work' && /formwork and rebar/.test(i.title)));
});
test('negative and completed language never silently verifies physical work',()=>{
 const result=analyzeNote("Apex will not deliver tomorrow; framing is complete; confirmed the follow-up call; remind me to verify the pour is done.",reference);
 assert.ok(result.every(i=>i.status==='pending'));
 assert.equal(result.filter(i=>i.collection==='commitments').length,0);
 assert.ok(result.some(i=>i.warning.includes('not verified')));
});
test('repeated clauses are deduplicated and parser does not mutate original note',()=>{
 const text='  Review RFI #42 tomorrow; Review RFI #42 tomorrow.  ';
 const result=analyzeNote(text,reference);assert.equal(result.length,1);assert.equal(text,'  Review RFI #42 tomorrow; Review RFI #42 tomorrow.  ');
});
test('comma/capitalized actions split without splitting materials; contractor names avoid action words',()=>{
 const result=analyzeNote('Install drywall tomorrow, Remind me to call Delta Electric Thursday and Check the RFI; pour concrete and rebar tomorrow',reference);
 assert.ok(result.some(i=>i.collection==='reminders' && i.contractor==='Delta Electric'));
 const drywall=result.find(i=>i.title.startsWith('Install drywall'));assert.equal(drywall.contractor,'');
 assert.ok(result.some(i=>i.title==='Check the RFI'));
 assert.ok(result.some(i=>i.title==='pour concrete and rebar tomorrow'));
 const observation=analyzeNote('Blue sky over the site',reference);assert.equal(observation[0].selected,false);
});
