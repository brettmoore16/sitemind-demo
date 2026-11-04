import { initialState, migrateState, summary, STORAGE_KEY, uid, collections, statuses, dateLabel, localDate, followUps, priorities, isDuplicate, addItem, setStatus } from './state.js';
import { analyzeNote } from './parser.js';
const $ = selector => document.querySelector(selector);
const escape = text => String(text ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const names={tasks:'Task',commitments:'Commitment',events:'Schedule event',reminders:'Reminder'};
let state=initialState(), storageAvailable=true, recovery=false;
try { const saved=localStorage.getItem(STORAGE_KEY); if(saved) {try {state=migrateState(JSON.parse(saved));} catch {recovery=true;} } } catch {storageAvailable=false;}
let filter='all', brief='morning', toastTimer, proposals=[], originalNote='', referenceDate, editing=null;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
function save(message){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));storageAvailable=true;}catch{storageAvailable=false;}render();if(message)toast(storageAvailable?message:'Change kept for this session. Browser storage is unavailable.');}
const due=item=>[item.dueDate?dateLabel(item.dueDate):item.time || 'No date set',item.dueTime].filter(Boolean).join(' · ');
const badge=item=>`<span class="status-badge status-${item.status}">${escape(item.status)}</span>`;
const actions=(collection,item)=>`<div class="item-actions"><button type="button" data-edit="${escape(item.id)}" data-collection="${collection}" aria-label="Edit ${escape(item.title)}">Edit</button><button type="button" data-delete="${escape(item.id)}" data-collection="${collection}" aria-label="Delete ${escape(item.title)}">Delete</button></div>`;
function source(item){if(!item.sourceNoteId)return '';const note=state.activities.find(a=>a.id===item.sourceNoteId);return note?`<details class="source-note"><summary>Original field note</summary><p>${escape(note.text)}</p></details>`:'';}
function taskRow(item,collection='tasks',prefix='task'){
 return `<div class="task-row ${item.status==='completed'?'done':''}"><input type="checkbox" id="${prefix}-${escape(item.id)}" data-check="${escape(item.id)}" data-collection="${collection}" ${item.status==='completed'?'checked':''} aria-label="${escape(item.title)}"><div class="task-body"><label class="task-title" for="${prefix}-${escape(item.id)}">${escape(item.title)}</label><div class="task-detail">${escape(item.detail)}${item.contractor?' · '+escape(item.contractor):''}</div><div class="item-meta">${badge(item)}<span>${escape(due(item))}</span>${item.priority==='high'?'<span class="priority">HIGH</span>':''}<span>${collection==='reminders' || item.kind==='followup'?'Follow-up':'Physical work'}</span></div>${actions(collection,item)}${source(item)}</div></div>`;
}
function render(){
 const s=summary(state);
 $('#workspace-date').textContent=`${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}).toUpperCase()} · FICTIONAL PROJECT`;
 $('#tasks-stat').innerHTML=`${s.open} <small>/ ${s.total}</small>`;$('#task-progress-text').textContent=`${s.done} completed`;$('#task-progress').style.width=`${s.total?s.done/s.total*100:0}%`;$('#task-count').textContent=s.total;$('#nav-task-count').textContent=s.open;$('#completion-label').textContent=`${s.done} of ${s.total} done`;
 const outstanding=state.commitments.filter(i=>i.status!=='completed');
 $('#commitment-stat').innerHTML=`${outstanding.length} <small>outstanding</small>`;$('#commitment-progress-text').textContent=`${s.confirmed} confirmed`;$('#commitment-extra').textContent=` · ${state.commitments.filter(i=>i.status==='completed').length} completed`;
 const events=[...state.events].sort((a,b)=>(a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.dueTime.localeCompare(b.dueTime));
 const openEvents=events.filter(i=>i.status!=='completed');
 $('#event-stat').innerHTML=`${openEvents.length} <small>open events</small>`;
 const next=openEvents.find(i=>i.dueDate>=localDate()) || openEvents[0];$('#next-event-label').textContent=next?`Next open: ${next.title} · ${due(next)}`:'No open events';
 $('#risk-stat').innerHTML=`${s.risks} <small>${s.risks?'need attention':'all clear'}</small>`;$('.risk-stat p').innerHTML=`<span class="amber">${s.highRisks} high priority</span> · ${s.risks?'stay ahead of it':'good work'}`;$('#risk-count').textContent=s.risks;
 $('#task-list').innerHTML=state.tasks.filter(t=>filter==='all' || (filter==='done'?t.status==='completed':t.status!=='completed')).map(t=>taskRow(t)).join('') || '<div class="empty-state">No tasks here. A little breathing room.</div>';
 const follows=followUps(state);$('#followup-count').textContent=follows.length;$('#followup-list').innerHTML=follows.map(i=>taskRow(i,i.collection,'follow')).join('') || '<div class="empty-state">No open follow-ups.</div>';
 $('#reminder-list').innerHTML=state.reminders.map(i=>taskRow(i,'reminders','reminder')).join('') || '<div class="empty-state">Add a reminder or include “remind me” in a field note.</div>';
 $('#priority-list').innerHTML=priorities(state).map((i,index)=>`<a class="priority-card" href="#${i.collection==='events'?'schedule':i.collection}"><span class="priority-rank">0${index+1}</span><div><strong>${escape(i.title)}</strong><p>${names[i.collection]} · ${escape(due(i))}</p>${badge(i)}</div></a>`).join('') || '<div class="empty-state">Everything is complete. Your priorities are clear.</div>';
 $('#commitment-list').innerHTML=state.commitments.map(c=>`<div class="contractor"><span class="contractor-avatar">${escape((c.contractor || 'Trade').split(' ').map(w=>w[0]).join('').slice(0,2))}</span><div class="contractor-content"><h3>${escape(c.contractor || 'Contractor not set')}</h3><p>${escape(c.title)}</p><small>${escape(c.detail)} · ${escape(due(c))}</small><div class="item-meta">${badge(c)}</div>${actions('commitments',c)}${source(c)}</div><button class="commitment-button ${c.status==='confirmed'?'confirmed':''}" data-confirm="${escape(c.id)}" aria-pressed="${c.status==='confirmed'}" ${c.status==='completed'?'disabled':''}>${c.status==='completed'?'Completed':c.status==='confirmed'?'✓ Confirmed':'Confirm ↗'}</button></div>`).join('') || '<div class="empty-state">No contractor commitments.</div>';
 $('#event-list').innerHTML=events.map(e=>`<div class="schedule-item"><div class="event-time">${escape(due(e))}</div><strong>${escape(e.title)}</strong><p>${escape(e.detail)}${e.contractor?' · '+escape(e.contractor):''}</p><div class="item-meta">${badge(e)}</div>${actions('events',e)}${source(e)}</div>`).join('') || '<div class="empty-state">No schedule events.</div>';
 $('#risk-list').innerHTML=state.risks.map(r=>`<div class="risk-item ${r.resolved?'resolved':''}"><div class="risk-top"><h3>${escape(r.title)}</h3><span class="risk-level">${r.resolved?'RESOLVED':escape(r.level)}</span></div><p>${escape(r.text)}</p><button class="risk-action" data-risk="${r.id}">${r.resolved?'Reopen risk ↗':'Mark resolved ↗'}</button></div>`).join('');
 $('#activity-list').innerHTML=state.activities.map(a=>`<div class="activity"><span class="avatar">${escape(a.initials)}</span><div><p><strong>${escape(a.author)}</strong><br>${escape(a.text)}</p><time>${escape(a.time)}</time>${a.referenceDate?`<time>Dates interpreted relative to ${escape(a.referenceDate)}</time>`:''}</div></div>`).join('');
 $('#storage-status').textContent=storageAvailable?'Saved in this browser':'Session only · browser storage unavailable';renderBrief();
}
function renderBrief(){
 const s=summary(state), morning=brief==='morning';
 $('#brief-title').textContent=morning?'Start strong. Stay ahead.':'Close the day with clarity.';
 $('#brief-intro').textContent=morning?'Here’s your field picture for Riverside Commons. A few things to keep on your radar:':`You’ve closed ${s.done} of ${s.total} tasks. Here’s what to carry into tomorrow’s huddle:`;
 const points=[`${s.open} open tasks · ${followUps(state).length} open follow-ups. Closing a follow-up does not complete physical work.`,`${s.confirmed} confirmed commitments. ${state.commitments.filter(i=>i.status==='completed').length} explicitly completed.`,morning?`${s.risks} open risks. Review the watch list before the crew gets moving.`:`${state.events.filter(i=>i.status!=='completed').length} open events. Review dates and contractor readiness before the next shift.`];
 $('#brief-points').innerHTML=points.map(p=>`<li>${escape(p)}</li>`).join('');$('#brief-summary').textContent='From your local project data';$('#ack-brief').textContent=state.readBriefings[brief]?'✓ Read · Mark unread':'Mark as read ↗';$('#ack-brief').setAttribute('aria-pressed',String(state.readBriefings[brief]));
}
// Shared item actions use only the selected collection and ID. No completion cascades.
document.addEventListener('change',event=>{
 const input=event.target.closest('[data-check]');if(!input)return;
 setStatus(state,input.dataset.collection,input.dataset.check,input.checked?'completed':'pending');save(input.checked?'This item completed. Related physical work is unchanged.':'Item reopened.');
 const replacement=document.getElementById(input.id);if(replacement)replacement.focus();
});
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.edit){openItem(button.dataset.collection,button.dataset.edit);}
 if(button.dataset.delete && confirm('Delete this item? The original field note and other items will remain.')){const key=button.dataset.collection;state[key]=state[key].filter(i=>i.id!==button.dataset.delete);save('Item deleted. Original field note retained.');}
 if(button.dataset.add)openItem(button.dataset.add);
 if(button.dataset.close)document.getElementById(button.dataset.close).close();
 if(button.dataset.confirm){const item=state.commitments.find(i=>i.id===button.dataset.confirm);setStatus(state,'commitments',item.id,item.status==='confirmed'?'pending':'confirmed');save('Commitment updated. Work completion is unchanged.');}
 if(button.dataset.risk){const risk=state.risks.find(r=>r.id===button.dataset.risk);risk.resolved=!risk.resolved;save(risk.resolved?'Risk resolved.':'Risk reopened.');}
});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});render();}));
document.querySelectorAll('[data-brief]').forEach(button=>button.addEventListener('click',()=>{brief=button.dataset.brief;document.querySelectorAll('[data-brief]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});renderBrief();}));
$('#ack-brief').addEventListener('click',()=>{state.readBriefings[brief]=!state.readBriefings[brief];save('Briefing updated.');});
function openEntry(){$('#entry-form').reset();$('#dialog-title').textContent='Add field update';$('#entry-label').textContent='What’s happening on site?';$('#task-options').hidden=true;$('#entry-text').placeholder='Apex will deliver steel tomorrow at 10 AM; remind me to call Apex Thursday; schedule the rebar inspection next Monday at 9 AM.';$('#entry-submit').textContent='Analyze & review →';$('#entry-dialog').showModal();$('#entry-text').focus();}
$('#add-task').addEventListener('click',()=>openItem('tasks'));
$('#open-update').addEventListener('click',()=>openEntry('update'));
$('#close-dialog').addEventListener('click',()=>$('#entry-dialog').close());
$('#entry-form').addEventListener('submit',event=>{event.preventDefault();originalNote=$('#entry-text').value;if(!originalNote.trim()){toast('Enter a field note first.');return;}referenceDate=new Date();proposals=analyzeNote(originalNote,referenceDate);$('#entry-dialog').close();$('#review-note').textContent=originalNote;$('#analysis-date').textContent=`Dates use your device’s local calendar: ${referenceDate.toLocaleString()}. A bare weekday includes today; “next” weekday means its next occurrence, at least one day away. Verify all dates.`;renderProposals();$('#review-dialog').showModal();});
function blankItem(){return {id:uid(),title:'',detail:'',contractor:'',dueDate:'',dueTime:'',time:'',status:'pending',priority:'normal',kind:'work',sourceNoteId:''};}
function options(values,current){return values.map(([value,label])=>`<option value="${value}" ${value===current?'selected':''}>${escape(label)}</option>`).join('');}
function fields(item,withType=false){return `${withType?`<label>Item type<select name="collection">${options(Object.entries(names),item.collection)}</select></label>`:''}<label>Title<input name="title" required maxlength="1000" value="${escape(item.title)}"></label><div class="field-grid"><label>Contractor / trade<input name="contractor" maxlength="150" value="${escape(item.contractor)}"></label><label>Status<select name="status">${options(statuses.map(s=>[s,s[0].toUpperCase()+s.slice(1)]),item.status)}</select></label><label>Date<input name="dueDate" type="date" value="${escape(item.dueDate)}"></label><label>Time<input name="dueTime" type="time" value="${escape(item.dueTime)}"></label><label>Priority<select name="priority">${options([['normal','Normal'],['high','High']],item.priority)}</select></label><label>Work type<select name="kind" ${item.collection==='reminders'?'disabled':''}>${options([['work','Physical work'],['followup','Follow-up only']],item.kind)}</select></label></div><label>Details<input name="detail" maxlength="1000" value="${escape(item.detail)}"></label>`;}
function readFields(container,item){const result={...item};for(const field of container.querySelectorAll('[name]'))result[field.name]=field.value.trim();if(result.collection==='reminders')result.kind='followup';if(result.dueDate!==item.dueDate || result.dueTime!==item.dueTime)result.time='';return result;}
function renderProposals(){
 $('#proposal-list').innerHTML=proposals.map((p,index)=>`<fieldset class="proposal" data-proposal="${index}"><legend><label class="include-label"><input type="checkbox" class="include-proposal" ${p.selected?'checked':''}> Include item ${index+1}</label></legend>${fields(p,true)}<p class="proposal-warning">${escape(p.warning || 'Review this suggested item before saving.')}${isDuplicate(state,p.collection,p)?' Duplicate already in workspace; it will be skipped.':''}</p></fieldset>`).join('') || '<p class="empty-state">No actionable items found. Save just the original note, or add a missed item.</p>';
 document.querySelectorAll('[data-proposal]').forEach(box=>{if(!box.querySelector('.include-proposal').checked)box.querySelectorAll('[name]').forEach(field=>field.disabled=true);});
}
function collectProposals(){return [...document.querySelectorAll('[data-proposal]')].map(box=>({...readFields(box,proposals[Number(box.dataset.proposal)]),selected:box.querySelector('.include-proposal').checked}));}
$('#proposal-list').addEventListener('change',event=>{const box=event.target.closest('[data-proposal]');if(!box)return;if(event.target.classList.contains('include-proposal'))box.querySelectorAll('[name]').forEach(field=>field.disabled=!event.target.checked);const kind=box.querySelector('[name=kind]');if(box.querySelector('[name=collection]').value==='reminders'){kind.value='followup';kind.disabled=true;}else if(box.querySelector('.include-proposal').checked)kind.disabled=false;});
$('#add-proposal').addEventListener('click',()=>{proposals=collectProposals();proposals.push({...blankItem(),collection:'tasks',selected:true,warning:'Added manually. Review before saving.'});renderProposals();});
$('#back-to-note').addEventListener('click',()=>{$('#review-dialog').close();$('#entry-dialog').showModal();});
$('#review-form').addEventListener('submit',event=>{
 event.preventDefault();const noteId=uid();let added=0,duplicates=0;
 const selected=collectProposals().filter(p=>p.selected);
 // Build on a copy so validation never leaves a partially saved note.
 const next=structuredClone(state);
 try{for(const candidate of selected){const {collection,warning,selected,...item}=candidate;item.sourceNoteId=noteId;if(addItem(next,collection,item))added++;else duplicates++;}}
 catch(error){toast(error.message);return;}
 next.activities.unshift({id:noteId,author:'James Mitchell',initials:'JM',text:originalNote,time:referenceDate.toLocaleString(),referenceDate:localDate(referenceDate)});
 state=next;$('#review-dialog').close();save(`Original note saved. ${added} items added${duplicates?`; ${duplicates} duplicates skipped`:''}.`);
});
function openItem(collection,id){const item=id?state[collection].find(i=>i.id===id):blankItem();editing={collection,id,item};$('#item-dialog-title').textContent=`${id?'Edit':'Add'} ${names[collection].toLowerCase()}`;$('#item-fields').innerHTML=fields({...item,collection,kind:collection==='reminders'?'followup':item.kind});$('#item-dialog').showModal();}
$('#item-form').addEventListener('submit',event=>{event.preventDefault();const {collection,id,item}=editing;const updated=readFields($('#item-fields'),{...item,collection});if(collection==='reminders')updated.kind='followup';if(isDuplicate(state,collection,updated,id)){toast('This item already exists with the same title, date, and time.');return;}try{if(id){const index=state[collection].findIndex(i=>i.id===id);const copy=structuredClone(state);copy[collection].splice(index,1);addItem(copy,collection,updated);state=copy;}else addItem(state,collection,updated);}catch(error){toast(error.message);return;}$('#item-dialog').close();save('Item saved. Related items are unchanged.');});
$('#reset-demo').addEventListener('click',()=>{if(!confirm('Reset all local items and field notes to the fictional demo?'))return;state=initialState();save('Demo data reset.');});
document.querySelectorAll('[data-filter],[data-brief]').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('selected'))));
render();if(recovery)toast('Saved data could not be read. The original stored value stays untouched until you save a change.');
