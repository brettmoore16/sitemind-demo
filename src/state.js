export const STORAGE_KEY = 'sitemind-dashboard-v1';
export function initialState() {
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
export function validState(value) {
  return value && Array.isArray(value.tasks) && value.tasks.every(t => typeof t.id === 'string' && typeof t.title === 'string' && typeof t.done === 'boolean' && typeof t.detail === 'string' && typeof t.time === 'string' && ['normal', 'high'].includes(t.priority)) && Array.isArray(value.commitments) && value.commitments.length === 3 && value.commitments.every(c => ['id','initials','name','text','contact'].every(k=>typeof c[k]==='string') && typeof c.confirmed === 'boolean') && Array.isArray(value.risks) && value.risks.length === 2 && value.risks.every(r=>['id','title','text','level'].every(k=>typeof r[k]==='string') && typeof r.resolved === 'boolean') && Array.isArray(value.activities) && value.activities.every(a=>['id','author','initials','text','time'].every(k=>typeof a[k]==='string')) && value.readBriefings && ['morning','evening'].every(k=>typeof value.readBriefings[k]==='boolean');
}
export function summary(state) {
  return { total: state.tasks.length, done: state.tasks.filter(t=>t.done).length, open: state.tasks.filter(t=>!t.done).length, confirmed: state.commitments.filter(c=>c.confirmed).length, risks: state.risks.filter(r=>!r.resolved).length, highRisks: state.risks.filter(r=>!r.resolved && r.level==='HIGH').length };
}
