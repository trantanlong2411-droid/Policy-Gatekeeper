import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRequest,evaluate,scenarioRequest,STATIC_POLICY,transaction,SAGA_ABI} from '../src/policy.mjs';
const when=new Date('2026-10-29T12:00:00.000Z');
const action={target:'0x934403227468426b33c26536dABC33b066B73f73',account:'0x74B2c2E4E4B771F0C75dcE44f40787468E323f79',method:'pending',requestedSpendPhrs:'0.001'};
const item=(scenario='standard')=>({stream:'demo-stream-00001',requestId:'request-00000001',scenario,action});
test('policy file contains all three rules',()=>{assert.equal(STATIC_POLICY.rules.maxProposedSpendPhrs,'0.02');assert.equal(STATIC_POLICY.rules.allowedMethods.length,3);assert.deepEqual(STATIC_POLICY.rules.utcWindow,{startHour:0,endHour:24})});
test('allowed path returns all three passing checks',()=>{const r=evaluate(parseRequest(item()),STATIC_POLICY,when);assert.equal(r.decision,'ALLOW');assert.equal(r.checks.length,3);assert.ok(r.checks.every(x=>x.passed))});
test('spend limit deny has explicit reason',()=>{const v=scenarioRequest(item('denySpend'),STATIC_POLICY,when);const r=evaluate(v.request,v.policy,when);assert.equal(r.decidedBy,'SPEND_LIMIT');assert.equal(r.decision,'DENY')});
test('allowlist deny has explicit reason',()=>{const v=scenarioRequest(item('denyAllowlist'),STATIC_POLICY,when);const r=evaluate(v.request,v.policy,when);assert.equal(r.decidedBy,'ALLOWLIST');assert.equal(r.decision,'DENY')});
test('time deny is robust for all UTC hours',()=>{
 for(let hour=0;hour<24;hour++){const now=new Date('2026-10-29T'+String(hour).padStart(2,'0')+':00:00.000Z');
  const v=scenarioRequest(item('denyTime'),STATIC_POLICY,now);
  assert.equal(evaluate(v.request,v.policy,now).decidedBy,'TIME_WINDOW');
 }
});
test('spend boundary is inclusive',()=>{assert.equal(evaluate(parseRequest({...item(),action:{...action,requestedSpendPhrs:'0.02'}})).decision,'ALLOW')});
test('bad inputs rejected',()=>{assert.throws(()=>parseRequest({...item(),requestId:'bad'}),/requestId/);assert.throws(()=>parseRequest({...item(),action:{...action,method:'transfer'}}),/Unsupported/);assert.throws(()=>parseRequest({...item(),action:{...action,requestedSpendPhrs:'-1'}}),/nonnegative/)});
test('allow prepares only zero-value read-only eth_call data',()=>{const tx=transaction(parseRequest(item()));assert.equal(tx.value,'0x0');assert.equal(SAGA_ABI.parseTransaction({data:tx.data}).name,'pending')});
