import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=(process.env.POLICY_URL||'https://policy-gatekeeper.trantanlong2411.workers.dev').replace(/\/$/,'');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const request=async(path,payload)=>{
 const resp=await fetch(base+path,{method:payload?'POST':'GET',
  headers:payload?{'content-type':'application/json'}:{},
  body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(24000)});
 const raw=await resp.text();let data;
 try{data=JSON.parse(raw)}catch{throw Error(path+' non-JSON HTTP '+resp.status+' '+raw.slice(0,200))}
 if(!resp.ok||!data.ok)throw Error(path+' HTTP '+resp.status+' '+JSON.stringify(data).slice(0,400));
 return data;
};
let health;
console.log('DIAGNOSTIC deployed Worker URL:',base);
for(let i=0;i<24;i++){
 try{
  health=await request('/api/health');
  console.log('DIAGNOSTIC health attempt',i+1,JSON.stringify(health).slice(0,450));
  if(health.service==='policy-gatekeeper'&&health.durable)break;
 }catch(e){
  console.log('DIAGNOSTIC health error',i+1,String(e.message).slice(0,420));
 }
 await wait(5000);
}
assert.equal(health?.readOnlyExecution,true,'Public Worker not yet responding with expected health; inspect diagnostics above');
assert.equal(health?.transactionBroadcast,false);
// Verify that original audit survived this newly deployed Worker version.
const prior=await request('/api/audit?stream=ci-policy-1793285601479-5p9iuggm');
assert.equal(prior.recordCount,4,'Earlier durable decision history was lost');
assert.deepEqual(prior.records.map(x=>x.decision),['ALLOW','DENY','DENY','DENY']);
assert.deepEqual(prior.records.slice(1).map(x=>x.decidedBy),['SPEND_LIMIT','ALLOWLIST','TIME_WINDOW']);
assert.ok(prior.records.slice(1).every(x=>x.rpcCallsAttempted===0));
console.log('ORIGINAL POLICY PROOF SURVIVED REDEPLOY',JSON.stringify({recordCount:prior.recordCount,
 rules:prior.records.slice(1).map(x=>x.decidedBy),stream:'ci-policy-1793285601479-5p9iuggm'}));
const cfg=(await request('/api/policy')).policy;
assert.equal(cfg.rules.maxProposedSpendPhrs,'0.02');
assert.equal(cfg.rules.allowedMethods.length,3);
assert.equal(cfg.rules.utcWindow.startHour,0);
const stream='ci-policy-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
const input={target:'0x934403227468426b33c26536dABC33b066B73f73',
 account:'0x74B2c2E4E4B771F0C75dcE44f40787468E323f79',
 method:'deposited',requestedSpendPhrs:'0.001'};
const records=[];
async function execute(scenario,expected){
 const id='request-'+scenario+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
 const payload={stream,requestId:id,scenario,action:input};
 const response=await request('/api/execute',payload);
 const r=response.record;
 assert.equal(r.decision,expected);
 assert.equal(r.transactionBroadcast,false);
 assert.equal(r.checks.length,3);
 assert.equal(r.scenario,scenario);
 if(expected==='DENY'){
  assert.equal(r.rpcCallsAttempted,0,'denied action attempted RPC execution');
  assert.equal(r.executionStatus,'NOT_EXECUTED');
  assert.equal(r.executionResult,null);
 }
 records.push(r);
 console.log('POLICY LIVE DECISION',JSON.stringify({id,scenario,decision:r.decision,decidedBy:r.decidedBy,
  executionStatus:r.executionStatus,rpcCallsAttempted:r.rpcCallsAttempted}));
 return {payload,r};
}
let allow,last;
for(let attempt=0;attempt<4;attempt++){
 allow=await execute('standard','ALLOW');
 if(allow.r.executionStatus==='EXECUTED_READ_ONLY')break;
 last=allow.r.error;
 if(attempt<3)await wait(13000);
}
assert.equal(allow.r.executionStatus,'EXECUTED_READ_ONLY','Live eth_call failed: '+last);
assert.equal(allow.r.executionResult.source,'LIVE_ETH_CALL');
assert.equal(allow.r.executionResult.chainId,688689);
for(const [scenario,rule] of [['denySpend','SPEND_LIMIT'],['denyAllowlist','ALLOWLIST'],['denyTime','TIME_WINDOW']]){
 const r=(await execute(scenario,'DENY')).r;
 assert.equal(r.decidedBy,rule);
 assert.ok(r.checks.some(x=>x.rule===rule&&!x.passed));
}
const repeat=await request('/api/execute',allow.payload);
assert.equal(repeat.record.duplicate,true);
const saved=await request('/api/audit?stream='+encodeURIComponent(stream));
assert.equal(saved.recordCount,records.length,'no duplicate logs should be appended');
assert.equal(saved.storage,'SQLITE_DURABLE_OBJECT');
assert.ok(saved.records.every(x=>x.transactionBroadcast===false));
const denied=saved.records.filter(x=>x.decision==='DENY');
assert.equal(denied.length,3);
assert.ok(denied.every(x=>x.rpcCallsAttempted===0));
const reload=await request('/api/audit?stream='+encodeURIComponent(stream));
assert.deepEqual(reload.records,saved.records);
await mkdir('proof',{recursive:true});
await writeFile('proof/live-policy-audit.json',JSON.stringify({schema:'policy-gatekeeper-ci-v1',
 verifiedAt:new Date().toISOString(),proofUrl:base+'/?stream='+stream,
 chainId:688689,publicReadOnlyOnly:true,saved},null,2)+'\n');
console.log('POLICY GATEKEEPER LIVE PROOF SUCCESS',JSON.stringify({
 proofUrl:base+'/?stream='+stream,stored:saved.recordCount,denials:denied.map(x=>x.decidedBy),
 rpcCallsForDenied:0,allowedValue:allow.r.executionResult.value,artifact:'proof/live-policy-audit.json'}));
