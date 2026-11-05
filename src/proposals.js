import { validItem, collections, isDuplicate, uid, validState } from './state.js';
export const proposalTypes=[...collections,'risks','journal'];
export function normalizeProposal(p) {
  return {...p,id:p.id || uid(),action:p.action || 'create',targetId:p.targetId || '',sourceNoteId:p.sourceNoteId || '',time:p.time || '',selected:p.selected!==false,warning:p.warning || p.reason || ''};
}
export function validateProposals(values, state) {
  if (!Array.isArray(values) || values.length>30) throw new Error('Up to 30 proposals are allowed. Split longer updates.');
  const seen=new Set();
  for(const value of values) {
    if (!proposalTypes.includes(value.collection) || !['create','update'].includes(value.action) || !validItem(value)) throw new Error('Invalid proposal fields.');
    if (value.action==='update') {
      if (!state[value.collection]?.some(i=>i.id===value.targetId)) throw new Error('The item to correct no longer exists.');
      const key=value.collection+':'+value.targetId;
      if(seen.has(key))throw new Error('Two corrections target the same item. Review one correction at a time.');
      seen.add(key);
    } else if(value.targetId) throw new Error('A new item cannot have a correction target.');
  }
  return values;
}
export function applyProposals(state, values, noteId) {
  validateProposals(values,state);
  const next=structuredClone(state); next.journal ||= [];
  let added=0,updated=0,duplicates=0;
  for(const proposal of values) {
    const {collection,action,targetId,warning,reason,selected,...raw}=proposal;
    const previous=action==='update'?next[collection].find(i=>i.id===targetId):null;
    const item={...raw,id:action==='update'?targetId:uid(),sourceNoteId:noteId};
    if(previous && !item.time && item.dueDate===previous.dueDate && item.dueTime===previous.dueTime)item.time=previous.time || '';
    if(collection==='risks') {
      const risk={id:item.id,title:item.title,text:item.detail,level:item.priority==='high'?'HIGH':'WATCH',resolved:item.status==='completed',sourceNoteId:noteId};
      const match=next.risks.findIndex(i=>i.id===item.id);
      if(action==='update') {next.risks[match]=risk;updated++;} else if(next.risks.some(i=>i.title.toLowerCase()===risk.title.toLowerCase()))duplicates++;else {next.risks.unshift(risk);added++;}
    } else {
      if(collection!=='journal' && isDuplicate(next,collection,item,action==='update'?targetId:'')){duplicates++;continue;}
      if(action==='update'){next[collection][next[collection].findIndex(i=>i.id===targetId)]=item;updated++;}
      else{next[collection].unshift(item);added++;}
    }
  }
  if(!validState(next))throw new Error('The proposed changes could not be validated.');
  return {state:next,added,updated,duplicates};
}
