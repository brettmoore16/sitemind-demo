import { initialState, validState, summary, STORAGE_KEY } from './state.js';
const $ = selector => document.querySelector(selector);
const escape = text => String(text).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
let state = initialState();
let storageAvailable = true;
let recovery = false;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) { const parsed = JSON.parse(saved); if (validState(parsed)) state = parsed; else recovery = true; }
} catch { storageAvailable = false; }
let filter = 'all';
let brief = 'morning';
let entryMode = 'task';
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('#toast').classList.remove('visible'),3500); }
function save(message) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; }
  render();
  if (message) toast(storageAvailable ? message : 'Change kept for this session. Browser storage is unavailable.');
}
function render() {
  const s = summary(state);
  $('#tasks-stat').innerHTML = `${s.open} <small>/ ${s.total}</small>`;
  $('#task-progress-text').textContent = `${s.done} completed`;
  $('#task-progress').style.width = `${s.total ? s.done / s.total * 100 : 0}%`;
  $('#task-count').textContent = s.total;
  $('#nav-task-count').textContent = s.open;
  $('#completion-label').textContent = `${s.done} of ${s.total} done`;
  $('#commitment-stat').innerHTML = `${state.commitments.length} <small>due today</small>`;
  $('#commitment-progress-text').textContent = `${s.confirmed} confirmed`;
  $('#risk-stat').innerHTML = `${s.risks} <small>${s.risks ? 'need attention' : 'all clear'}</small>`;
  $('.risk-stat p').innerHTML = `<span class="amber">${s.highRisks} high priority</span> · ${s.risks ? 'stay ahead of it' : 'good work'}`;
  $('#risk-count').textContent = s.risks;
  const tasks = state.tasks.filter(t => filter === 'all' || (filter === 'done' ? t.done : !t.done));
  $('#task-list').innerHTML = tasks.map(t=>`<div class="task-row ${t.done?'done':''}"><input type="checkbox" id="${escape(t.id)}" data-task="${escape(t.id)}" ${t.done?'checked':''} aria-label="${escape(t.title)}"><div class="task-body"><label class="task-title" for="${escape(t.id)}">${escape(t.title)}</label><div class="task-detail">${escape(t.detail)}</div></div>${t.priority==='high' && !t.done?'<span class="priority">HIGH</span>':`<span class="task-time">${escape(t.time)}</span>`}</div>`).join('') || '<div class="empty-state">No tasks here. A little breathing room.</div>';
  $('#commitment-list').innerHTML = state.commitments.map(c=>`<div class="contractor"><span class="contractor-avatar">${escape(c.initials)}</span><div class="contractor-content"><h3>${escape(c.name)}</h3><p>${escape(c.text)}</p><small>${escape(c.contact)}</small></div><button class="commitment-button ${c.confirmed?'confirmed':''}" data-commitment="${c.id}" aria-pressed="${c.confirmed}" aria-label="${c.confirmed?'Unconfirm':'Confirm'} ${escape(c.name)} commitment">${c.confirmed?'✓ Confirmed':'Confirm ↗'}</button></div>`).join('');
  $('#risk-list').innerHTML = state.risks.map(r=>`<div class="risk-item ${r.resolved?'resolved':''}"><div class="risk-top"><h3>${escape(r.title)}</h3><span class="risk-level">${r.resolved?'RESOLVED':escape(r.level)}</span></div><p>${escape(r.text)}</p><button class="risk-action" data-risk="${r.id}">${r.resolved?'Reopen risk ↗':'Mark resolved ↗'}</button></div>`).join('');
  $('#activity-list').innerHTML = state.activities.map(a=>`<div class="activity"><span class="avatar">${escape(a.initials)}</span><div><p><strong>${escape(a.author)}</strong><br>${escape(a.text)}</p><time>${escape(a.time)}</time></div></div>`).join('');
  $('#storage-status').textContent = storageAvailable ? 'Saved in this browser' : 'Session only · browser storage unavailable';
  renderBrief();
}
function renderBrief() {
  const s = summary(state);
  const morning = brief === 'morning';
  $('#brief-title').textContent = morning ? 'Start strong. Stay ahead.' : 'Close the day with clarity.';
  $('#brief-intro').textContent = morning ? 'Here’s your field picture for Riverside Commons. A few things to keep on your radar:' : `You’ve closed ${s.done} of ${s.total} tasks. Here’s what to carry into tomorrow’s huddle:`;
  const points = morning ? [s.open ? `${s.open} tasks to close today. Start with ${state.tasks.find(t=>!t.done && t.priority==='high')?.title.toLowerCase() || 'your next open item'}.` : 'All tasks are complete. Take a moment to review tomorrow’s work.', `${state.commitments.length-s.confirmed} contractor commitments still need confirmation.`, s.risks ? `${s.risks} open risks to watch. Review the watch list before the crew gets moving.` : 'Your watch list is clear. Keep an eye on changing site conditions.'] : [s.open ? `${s.open} tasks remain open. Review them before handing off to the next shift.` : 'Today’s checklist is complete. Nice work keeping the site moving.', `${s.confirmed} of ${state.commitments.length} contractor commitments confirmed. Verify completion with each trade.`, 'Tomorrow: Zone B concrete pour at 7:00 AM. Recheck the forecast and crew readiness.'];
  $('#brief-points').innerHTML = points.map(p=>`<li>${escape(p)}</li>`).join('');
  $('#brief-summary').textContent = 'From your local project data';
  $('#ack-brief').textContent = state.readBriefings[brief] ? '✓ Read · Mark unread' : 'Mark as read ↗';
  $('#ack-brief').setAttribute('aria-pressed', String(state.readBriefings[brief]));
}
$('#task-list').addEventListener('change', event=> { const t=state.tasks.find(t=>t.id===event.target.dataset.task); if(t){t.done=event.target.checked;save(t.done?'Task completed. One step forward.':'Task reopened.');} });
$('#commitment-list').addEventListener('click',event=>{const button=event.target.closest('[data-commitment]');if(!button)return;const c=state.commitments.find(c=>c.id===button.dataset.commitment);c.confirmed=!c.confirmed;save(`${c.name} ${c.confirmed?'confirmed':'confirmation removed'}.`);$(`[data-commitment="${c.id}"]`).focus();});
$('#risk-list').addEventListener('click',event=>{const button=event.target.closest('[data-risk]');if(!button)return;const r=state.risks.find(r=>r.id===button.dataset.risk);r.resolved=!r.resolved;save(r.resolved?'Risk resolved.':'Risk reopened.');$(`[data-risk="${r.id}"]`).focus();});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});render();}));
document.querySelectorAll('[data-brief]').forEach(button=>button.addEventListener('click',()=>{brief=button.dataset.brief;document.querySelectorAll('[data-brief]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});renderBrief();}));
$('#ack-brief').addEventListener('click',()=>{state.readBriefings[brief]=!state.readBriefings[brief];save('Briefing updated.');});
function openEntry(mode){entryMode=mode;$('#entry-form').reset();$('#dialog-title').textContent=mode==='task'?'Add a task':'Add field update';$('#entry-label').textContent=mode==='task'?'What needs to happen?':'What’s happening on site?';$('#task-options').hidden=mode!=='task';$('#entry-text').placeholder=mode==='task'?'e.g. Confirm tomorrow’s concrete delivery':'e.g. East corridor rough-in complete. Ready for inspection.';$('#entry-dialog').showModal();$('#entry-text').focus();}
$('#add-task').addEventListener('click',()=>openEntry('task'));
$('#open-update').addEventListener('click',()=>openEntry('update'));
$('#close-dialog').addEventListener('click',()=>$('#entry-dialog').close());
$('#entry-form').addEventListener('submit',event=>{event.preventDefault();const text=$('#entry-text').value.trim();if(!text){$('#entry-text').setCustomValidity('Enter a task or update.');$('#entry-text').reportValidity();return;}const id=crypto.randomUUID?.() || `local-${Date.now()}`;if(entryMode==='task'){state.tasks.unshift({id,title:text,detail:'Added by you · Field task',time:'Today',priority:$('#entry-priority').value,done:false});filter='all';document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b.dataset.filter==='all');b.setAttribute('aria-pressed',String(b.dataset.filter==='all'));});}else{state.activities.unshift({id,author:'James Mitchell',initials:'JM',text,time:new Date().toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})});}$('#entry-dialog').close();save(entryMode==='task'?'Task added to your checklist.':'Field update saved.');});
$('#entry-text').addEventListener('input',()=>$('#entry-text').setCustomValidity(''));
$('#reset-demo').addEventListener('click',()=>{if(!confirm('Reset all tasks, confirmations, briefings, risks, and field updates to the fictional demo? Your changes in this browser will be removed.'))return;state=initialState();save('Demo data reset.');});
document.querySelectorAll('[data-filter],[data-brief]').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('selected'))));
render();
if(recovery)toast('Saved data was incompatible. A fresh demo has been loaded.');
