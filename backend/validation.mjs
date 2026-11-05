import { isDeepStrictEqual } from 'node:util';
import { assert } from './errors.mjs';
import { validState, collections, validDate } from '../src/state.js';
export function uuid(value) { assert(typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),400,'Invalid project identifier');return value; }
export function noteInput(body) {
  assert(typeof body.note==='string' && body.note.trim().length>0 && body.note.length<=4000,400,'Enter a field note of up to 4,000 characters');
  assert(validDate(body.referenceDate),400,'Use a valid local reference date');
  try { new Intl.DateTimeFormat('en-US',{timeZone:body.timezone}).format(); } catch {assert(false,400,'Invalid timezone');}
  assert(typeof body.timezone==='string' && body.timezone.length<100,400,'Specify an IANA timezone');
  return body;
}
export function workspaceInput(body,current,actor) {
  assert(body.confirmed===true,400,'Explicit confirmation is required');
  assert(Number.isSafeInteger(body.revision) && body.revision>=0,400,'A project revision is required');
  const state=body.state;
  assert(validState(state) && Array.isArray(state.journal) && state.journal.length<=500,400,'Invalid workspace');
  const items=[...collections.flatMap(k=>state[k]),...state.journal];
  assert(items.length<=2000 && state.risks.length<=500 && state.activities.length<=2000,400,'Workspace limits reached');
  for(const item of items)assert(item.id.length<=100 && item.title.length<=1000 && item.detail.length<=1000 && item.contractor.length<=150,400,'An item exceeds field limits');
  for(const risk of state.risks)assert(risk.id.length<=100 && risk.title.length<=1000 && risk.text.length<=1000,400,'Risk exceeds field limits');
  const ids=new Set();
  for(const note of state.activities){assert(!ids.has(note.id) && note.id.length<=100 && note.text.length<=4000 && note.author.length<=150 && note.initials.length<=10 && note.time.length<=150,400,'Invalid original note');ids.add(note.id);}
  if(actor)for(const note of state.activities)if(!current.activities.some(old=>old.id===note.id))assert(note.author===actor.email,400,'New notes must identify the signed-in author');
  for(const old of current.activities){const next=state.activities.find(n=>n.id===old.id);assert(next && isDeepStrictEqual(next,old),400,'Original field notes cannot be changed or removed');}
  for(const item of items)assert(!item.sourceNoteId || ids.has(item.sourceNoteId),400,'An item references a missing field note');
  return state;
}
export function preferencesInput(body) {
  assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(body.morningTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.eveningTime),400,'Use HH:mm delivery times');
  assert(typeof body.smsOptIn==='boolean',400,'An explicit SMS preference is required');
  assert(typeof body.timezone==='string' && body.timezone.length<100,400,'Specify a timezone');
  try {new Intl.DateTimeFormat('en-US',{timeZone:body.timezone}).format();} catch {assert(false,400,'Invalid timezone');}
  return {morning_time:body.morningTime,evening_time:body.eveningTime,timezone:body.timezone,sms_opt_in:body.smsOptIn,consent_recorded_at:body.smsOptIn?new Date().toISOString():null};
}
