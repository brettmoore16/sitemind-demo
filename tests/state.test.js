import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, summary, validState } from '../src/state.js';
test('demo totals reflect task, contractor, and risk changes', () => {
  const state = initialState();
  assert.deepEqual(summary(state), { total: 6, done: 1, open: 5, confirmed: 1, risks: 2, highRisks: 1 });
  state.tasks[0].done = true;
  state.commitments[0].confirmed = true;
  state.risks[0].resolved = true;
  assert.deepEqual(summary(state), { total: 6, done: 2, open: 4, confirmed: 2, risks: 1, highRisks: 0 });
});
test('persisted data validates and malformed data is rejected', () => {
  const state = initialState();
  assert.ok(validState(JSON.parse(JSON.stringify(state))));
  assert.ok(!validState({tasks: []}));
  state.tasks[0].done = 'yes';
  assert.ok(!validState(state));
});
test('reset data does not share mutable state', () => {
  const first = initialState();
  first.tasks[0].done = true;
  assert.equal(initialState().tasks[0].done, false);
});
