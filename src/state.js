export const STORAGE_KEY = 'sitemind-dashboard-v1';
function legacySeed() {
  return {
    tasks: [
      { id: 't1', title: 'Walk Level 2 before framing inspection', detail: 'East wing · Quality control', time: '8:30 AM', priority: 'high', done: false },
      { id: 't2', title: 'Confirm steel delivery window with Apex', detail: 'Apex Steel · Material delivery', time: '9:00 AM', priority: 'normal', done: false },
      { id: 't3', title: 'Review RFI #042 with the design team', detail: 'MEP coordination · Open item', time: '10:00 AM', priority: 'high', done: false },
      { id: 't4', title: 'Upload progress photos from Zone B', detail: 'Daily documentation', time: '12:00 PM', priority: 'normal', done: false },
      { id: 't5', title: 'Verify tomorrow’s concrete pour readiness', detail: 'Summit Concrete · Zone B', time: '3:00 PM', priority: 'normal', done: false },
      { id: 't6', title: 'Complete morning safety huddle', detail: 'All crews · Toolbox talk', time: '7:00 AM', priority: 'normal', done: true }
    ],
    commitments: [
      { id: 'c1', initials: 'AS', name: 'Apex Steel', text: 'Deliver Level 3 structural steel to the north staging area.', contact: 'Mike Torres · By 10:00 AM', confirmed: false },
      { id: 'c2', initials: 'PE', name: 'Precision Electric', text: 'Complete rough-in on Level 2 east corridor.', contact: 'Sarah Chen · By 2:00 PM', confirmed: false },
      { id: 'c3', initials: 'SC', name: 'Summit Concrete', text: 'Finish formwork and rebar inspection for Zone B.', contact: 'David Ruiz · By 3:00 PM', confirmed: true }
    ],
    risks: [
      { id: 'r1', title: 'Steel delivery may impact crane time', text: 'Delivery window is unconfirmed. Coordinate with Apex before the 10 AM crane slot.', level: 'HIGH', resolved: false },
      { id: 'r2', title: 'Rain forecast for tomorrow’s pour', text: 'Check conditions before the 7 AM start. Keep a weather contingency ready.', level: 'WATCH', resolved: false }
    ],
    activities: [
      { id: 'a1', author: 'James Mitchell', initials: 'JM', text: 'Morning safety huddle complete. All crews checked in; access routes are clear.', time: '7:15 AM · Demo day' },
      { id: 'a2', author: 'David Ruiz', initials: 'DR', text: 'Zone B formwork is on track. Rebar crew is finishing the final section.', time: '7:05 AM · Demo day' }
    ],
    readBriefings: { morning: false, evening: false }
  };
}

export const statuses = ['pending', 'scheduled', 'confirmed', 'completed'];
export const collections = ['tasks', 'commitments', 'events', 'reminders'];
export const uid = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function dateLabel(value) {
  if (!value) return 'No date set';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'});
}
export function initialState() { return migrateState(legacySeed()); }
export function migrateState(value) {
  if (!value || !Array.isArray(value.tasks) || !Array.isArray(value.commitments) || !Array.isArray(value.risks) || !Array.isArray(value.activities)) throw new Error('Invalid saved workspace');
  if (value.schemaVersion === 2) {
    if(!value.journal)value = {...value,journal:[]};
    if (!validState(value)) throw new Error('Invalid saved workspace');
    return value;
  }
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const normalize = (item, type) => ({
    id:item.id, title:type === 'commitments' ? item.text : item.title,
    detail:type === 'commitments' ? item.contact : item.detail,
    contractor:type === 'commitments' ? item.name : '',
    status:item.done ? 'completed' : item.confirmed ? 'confirmed' : 'pending',
    priority:item.priority || 'normal', kind:type === 'tasks' && /^(confirm|review|upload|verify|call|check|follow up)\b/i.test(item.title) ? 'followup' : 'work',
    dueDate:'', dueTime:'', time:item.time || '', sourceNoteId:''
  });
  const result = {
    schemaVersion:2,
    tasks:value.tasks.map(t=>normalize(t,'tasks')),
    commitments:value.commitments.map(c=>normalize(c,'commitments')),
    events:[
      ['MEP coordination','Site trailer · All trade leads',localDate(),'09:30'],
      ['Level 2 framing inspection','East wing · City inspector',localDate(),'11:00'],
      ['Owner walkthrough','Main entrance · Project team',localDate(),'14:00'],
      ['Concrete pour · Zone B','Pending weather check',localDate(tomorrow),'07:00']
    ].map(([title,detail,dueDate,dueTime],i)=>({id:`e${i}`,title,detail,dueDate,dueTime,status:'scheduled',priority:'normal',contractor:'',kind:'work',sourceNoteId:'',time:''})),
    reminders:[], journal:[], risks:value.risks, activities:value.activities,
    readBriefings:value.readBriefings || {morning:false,evening:false}
  };
  if (!validState(result)) throw new Error('Invalid saved workspace');
  return result;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !isNaN(date) && localDate(date) === value;
}
export function validItem(item) {
  return item && ['id','title','detail','contractor','kind','dueDate','dueTime','sourceNoteId','time'].every(k=>typeof item[k]==='string') && item.title.trim().length > 0 && statuses.includes(item.status) && ['normal','high'].includes(item.priority) && ['work','followup'].includes(item.kind) && (!item.dueDate || validDate(item.dueDate)) && (!item.dueTime || /^([01]\d|2[0-3]):[0-5]\d$/.test(item.dueTime));
}
export function validState(value) {
  return !!(value && value.schemaVersion === 2 && (!value.journal || (Array.isArray(value.journal) && value.journal.every(validItem))) && collections.every(key => Array.isArray(value[key]) && value[key].every(validItem) && new Set(value[key].map(i=>i.id)).size === value[key].length) && Array.isArray(value.risks) && value.risks.every(r=>['id','title','text','level'].every(k=>typeof r[k]==='string') && typeof r.resolved === 'boolean') && Array.isArray(value.activities) && value.activities.every(a=>['id','author','initials','text','time'].every(k=>typeof a[k]==='string')) && value.readBriefings && ['morning','evening'].every(k=>typeof value.readBriefings[k]==='boolean'));
}
export function summary(state) {
  return {total:state.tasks.length, done:state.tasks.filter(t=>t.status==='completed').length, open:state.tasks.filter(t=>t.status!=='completed').length, confirmed:state.commitments.filter(c=>c.status==='confirmed').length, risks:state.risks.filter(r=>!r.resolved).length, highRisks:state.risks.filter(r=>!r.resolved && r.level==='HIGH').length};
}
export function followUps(state) {
  return [...state.tasks.filter(t=>t.kind==='followup').map(t=>({...t,collection:'tasks'})), ...state.reminders.map(t=>({...t,collection:'reminders'}))].filter(t=>t.status!=='completed');
}
export function priorities(state) {
  return collections.flatMap(collection=>state[collection].map(item=>({...item,collection}))).filter(i=>i.status!=='completed').sort((a,b)=> Number(b.priority==='high')-Number(a.priority==='high') || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (a.dueTime || '99').localeCompare(b.dueTime || '99')).slice(0,3);
}
export function itemKey(item) {
  // Dates stay significant: the same physical operation on two days can be legitimate.
  const text = item.title.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\b(?:please|the|a|an)\b/g,' ').replace(/\s+/g,' ').trim();
  return `${text}|${item.dueDate || ''}|${item.dueTime || ''}`;
}
export function isDuplicate(state, collection, candidate, exceptId='') {
  return state[collection].some(item=>item.id!==exceptId && itemKey(item)===itemKey(candidate));
}
export function addItem(state, collection, item) {
  if (!collections.includes(collection) || !validItem(item)) throw new Error('Please check the item fields.');
  if (isDuplicate(state,collection,item)) return false;
  state[collection].unshift(item);
  return true;
}
export function setStatus(state, collection, id, status) {
  if (!statuses.includes(status)) return;
  const item=state[collection]?.find(i=>i.id===id);
  if (item) item.status=status; // Intentionally never cascades to linked physical work.
}

export function emptyWorkspace() {return {schemaVersion:2,tasks:[],commitments:[],events:[],reminders:[],risks:[],journal:[],activities:[],readBriefings:{morning:false,evening:false}};}
