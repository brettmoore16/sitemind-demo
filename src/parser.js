import { localDate, uid, itemKey } from './state.js';
const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
// Interpret dates in the device's local calendar. Bare weekdays include today;
// "next Monday" always means the next occurrence, at least one day away.
export function parseWhen(text, reference = new Date()) {
  const lower=text.toLowerCase();
  let date='', time='', warning='';
  const result=new Date(reference.getFullYear(),reference.getMonth(),reference.getDate(),12);
  const iso=lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    const candidate=new Date(`${iso[1]}T12:00:00`);
    if (!isNaN(candidate) && localDate(candidate)===iso[1]) date=iso[1];
    else warning='Date was not recognized. Choose a date.';
  } else {
    const offset=lower.match(/\bin\s+(\d+)\s+days?\b/);
    const weekday=lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (/\bday after tomorrow\b/.test(lower)) result.setDate(result.getDate()+2);
    else if (/\btomorrow\b/.test(lower)) result.setDate(result.getDate()+1);
    else if (/\b(today|tonight)\b/.test(lower)) { /* today */ }
    else if (offset) result.setDate(result.getDate()+Number(offset[1]));
    else if (weekday) { let delta=(weekdays.indexOf(weekday[2])-result.getDay()+7)%7; if (weekday[1] && !delta) delta=7; result.setDate(result.getDate()+delta); }
    else warning='No date recognized. Leave blank or choose one.';
    if (!warning) date=localDate(result);
  }
  const clock=lower.match(/\b(?:at\s+|by\s+)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/);
  const military=lower.match(/\b(?:at|by)\s+([01]\d|2[0-3]):([0-5]\d)\b/);
  if (clock && Number(clock[1])>=1 && Number(clock[1])<=12) time=`${String(Number(clock[1])%12+(clock[3][0]==='p'?12:0)).padStart(2,'0')}:${clock[2] || '00'}`;
  else if (military) time=`${military[1]}:${military[2]}`;
  else if (/\bnoon\b/.test(lower)) time='12:00';
  else if (/\bmidnight\b/.test(lower)) time='00:00';
  if (/\b(?:morning|afternoon|evening|eod|end of day)\b/.test(lower) && !time) warning += ' Time is approximate; choose an exact time if needed.';
  if (/\b(?:next week|next month|\d{1,2}\/\d{1,2})\b/.test(lower) && !date) warning='Ambiguous date; choose an exact date.';
  return {dueDate:date,dueTime:time,warning:warning.trim()};
}
function contractorOf(text) {
  const known=text.match(/\b(apex(?:\s+steel)?|precision(?:\s+electric)?|summit(?:\s+concrete)?)\b/i);
  if(known) return /apex/i.test(known[0])?'Apex Steel':/precision/i.test(known[0])?'Precision Electric':'Summit Concrete';
  const company=text.match(/\b([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2}\s+(?:Electric|Electrical|Plumbing|Concrete|Steel|Drywall|Roofing|Mechanical))\b/);
  if(company && !/^(install|inspect|review|call|confirm|check|verify|schedule|deliver|finish|complete|repair|order|pour)\b/i.test(company[0]))return company[0];
  const trade=text.match(/\b(?:electricians?|plumbers?|framers?|roofers?|drywall\s+crew|mep\s+crew|hvac\s+crew|concrete\s+crew|steel\s+crew|fire\s+sprinkler\s+crew)\b/i);
  if(trade)return trade[0];
  return text.match(/^([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2})\s+(?:will|promised|committed|agreed|to)\b/)?.[1] || '';
}
export function analyzeNote(text, reference = new Date()) {
  const clauses=text.split(/\n+|;+|(?<=[.!?])\s+(?=[A-Z])/).flatMap(part=>part.split(/\s+(?:and then|then|also)\s+|(?:\s+and\s+|,\s*)(?=(?:remind|call|confirm|check|verify|follow\s+up|schedule|inspect|review|order|install|pour|finish|submit|send|upload|[a-z][\w-]*(?:\s+[a-z][\w-]*){0,2}\s+(?:will|promised|to))\b)/i)).map(t=>t.replace(/^\s*[-•\d.)]+\s*/,'').trim()).filter(Boolean);
  const proposals=[];
  for(const clause of clauses) {
    const title=clause.replace(/[.!?]+$/,'').trim();
    const when=parseWhen(title,reference);
    const contractor=contractorOf(title);
    const followup=/\b(remind(?:er)?|follow[ -]?up|call|confirm|check(?:\s+with)?|verify|ask|chase|email|text|contact|review|submit|upload|send)\b/i.test(title);
    const reminder=/\b(remind(?:er)?|follow[ -]?up)\b/i.test(title);
    const promise=!!contractor && /\b(will|shall|promis\w*|committ\w*|agreed|owes|to\s+(?:deliver|install|finish|complete|rough|pour|return|start)|is\s+(?:delivering|installing|finishing))\b/i.test(title);
    const event=/\b(inspection|inspect|meeting|meet|walkthrough|walk-through|delivery|deliver|pour|schedule|scheduled|coordination|toolbox|huddle)\b/i.test(title) && (!!when.dueDate || /\b(schedule|scheduled|meeting|inspection)\b/i.test(title));
    const physical=/\b(install|installation|rough[ -]?in|formwork|rebar|punch[ -]?list|rfi|submittal|drywall|framing|concrete|pour|deliver|delivery|hvac|mep|steel|finish|complete|repair|erect|grade|excavate|waterproof|test|inspect)\b/i.test(title);
    // Negative statements are retained as a reviewable task, never a confirmed promise.
    const negative=/\b(can(?:not|'t)|won't|will not|not confirmed|cancelled|canceled|delayed|no longer)\b/i.test(title);
    const base={id:uid(),title,detail:'Proposed from a field note',contractor,priority:/\b(urgent|asap|critical|safety|high priority|blocker)\b/i.test(title)?'high':'normal',kind:followup?'followup':'work',dueDate:when.dueDate,dueTime:when.dueTime,time:'',sourceNoteId:'',status:'pending',warning:[when.warning,/\b(done|complete[ds]?|finished)\b/i.test(title)?'Reported completion is not verified. Status stays pending for your review.':'',negative?'Possible cancellation, delay, or uncertainty. Verify before saving.':''].filter(Boolean).join(' '),selected:true};
    const add=(collection,extra={})=>proposals.push({...base,id:uid(),collection,...extra});
    if(reminder) add('reminders',{kind:'followup'});
    else if(followup) add('tasks',{kind:'followup'});
    else if(promise && !negative) {add('commitments');if(event)add('events',{status:when.dueDate?'scheduled':'pending'});}
    else if(event && !negative) add('events',{status:when.dueDate?'scheduled':'pending'});
    else if(physical || negative || /\b(need|must|ensure|order|prepare|arrange|book|coordinate|remove|clean)\b/i.test(title)) add('tasks');
    else if(title.length>2) add('tasks',{selected:false,warning:[base.warning,'No clear action recognized. Include only if this should be a task.'].filter(Boolean).join(' ')});
  }
  const seen=new Set();
  return proposals.filter(p=>{const key=p.collection+'|'+itemKey(p);if(seen.has(key))return false;seen.add(key);return true;});
}
