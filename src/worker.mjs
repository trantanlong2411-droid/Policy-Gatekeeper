import {DurableObject} from 'cloudflare:workers';
import {NETWORK,STATIC_POLICY,parseRequest,scenarioRequest,evaluate,transaction,decode,publicPolicy} from './policy.mjs';
import {HTML} from './page.mjs';

const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
// The original verified proof is frozen to prevent third-party edits.
const READ_ONLY_PROOF_STREAMS=new Set(['ci-policy-1793285601479-5p9iuggm']);
const validStream=s=>{
 const v=String(s||'');
 if(!/^[a-zA-Z0-9_-]{10,100}$/.test(v))throw Error('Invalid notebook stream ID');
 return v;
};
const body=async request=>{
 const text=await request.text();
 if(text.length>5000)throw Error('Request is too large');
 try{return JSON.parse(text)}catch{throw Error('Invalid JSON')}
};
async function rpc(method,params){
 const r=await fetch(NETWORK.rpc,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Pharos Atlantic RPC HTTP '+r.status);
 let x;try{x=await r.json()}catch{throw Error('Pharos RPC non-JSON response')}
 if(x?.error)throw Error(String(x.error.message||'RPC error').slice(0,200));
 if(x?.result==null)throw Error('Pharos RPC missing '+method+' result');
 return x.result;
}
export class PolicyAudit extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.pending=new Map()}
 async saveRecord(record){
  await this.ctx.storage.transaction(async txn=>{
   const old=(await txn.get('audit'))||[];
   old.push(record);
   await txn.put('audit',old.slice(-150));
  });
 }
 async handle(bodyData){
  const now=new Date();
  const {request,policy,scenarioIsDemonstration}=scenarioRequest(bodyData,STATIC_POLICY,now);
  const history=(await this.ctx.storage.get('audit'))||[];
  const existing=history.find(x=>x.requestId===request.requestId);
  if(existing)return {...existing,duplicate:true};
  const rule=evaluate(request,policy,now);
  const record={schema:'pharos-policy-decision-v1',
   requestId:request.requestId,stream:request.stream,
   observedAt:now.toISOString(),scenario:request.scenario,
   scenarioIsDemonstration,policyVersion:STATIC_POLICY.version,
   policyApplied:policy.rules,action:request.action,decision:rule.decision,
   decidedBy:rule.decidedBy,checks:rule.checks,
   executionStatus:'NOT_EXECUTED',rpcCallsAttempted:0,
   executionResult:null,error:null,transactionBroadcast:false,privateKeysUsed:false};
  if(rule.allowed){
   // This branch is the only place the actual action is called. A DENY never reaches it.
   record.rpcCallsAttempted++;
   try{
    const id=await rpc('eth_chainId',[]);
    if(Number(BigInt(id))!==NETWORK.chainId)throw Error('Wrong RPC network; expected Atlantic 688689');
    const tx=transaction(request);
    record.rpcCallsAttempted++;
    const output=await rpc('eth_call',[tx,'latest']);
    record.executionResult={method:request.action.method,value:decode(request,output),
     network:'Pharos Atlantic',chainId:NETWORK.chainId,source:'LIVE_ETH_CALL'};
    record.executionStatus='EXECUTED_READ_ONLY';
   }catch(e){
    record.executionStatus='RPC_FAILED_NO_TRANSACTION';
    record.error=String(e.message||e).slice(0,250);
   }
  }
  await this.saveRecord(record);
  return record;
 }
 async fetch(request){
  const u=new URL(request.url);
  try{
   if(u.pathname==='/audit'&&request.method==='GET'){
    const records=(await this.ctx.storage.get('audit'))||[];
    return reply({ok:true,storage:'SQLITE_DURABLE_OBJECT',recordCount:records.length,
     records,mostRecent:records.at(-1)||null,policy:publicPolicy()});
   }
   if(u.pathname!=='/execute'||request.method!=='POST')return reply({ok:false,error:'Not found'},404);
   const b=await body(request);
   const parsed=parseRequest(b);
   const key=parsed.requestId;
   if(this.pending.has(key))return reply({ok:true,record:{...(await this.pending.get(key)),duplicate:true}});
   const task=this.handle(b);
   this.pending.set(key,task);
   try{return reply({ok:true,record:await task})}
   finally{this.pending.delete(key)}
  }catch(e){return reply({ok:false,decision:'DENY',
   reason:'VALIDATION_OR_STORAGE_ERROR',error:String(e.message||e).slice(0,350),
   transactionBroadcast:false},400)}
 }
}
export default{
 async fetch(request,env){
  const u=new URL(request.url);
  try{
   if(u.pathname==='/'&&request.method==='GET')return new Response(HTML,{headers:{
    'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
   if(u.pathname==='/api/health'&&request.method==='GET')return reply({ok:true,
    service:'policy-gatekeeper',chainId:688689,policyVersion:STATIC_POLICY.version,
    durable:true,readOnlyExecution:true,transactionBroadcast:false});
   if(u.pathname==='/api/policy'&&request.method==='GET')return reply({ok:true,policy:publicPolicy()});
   const stream=u.pathname==='/api/audit'?validStream(u.searchParams.get('stream')):null;
   if(u.pathname==='/api/audit'&&request.method==='GET'){
    const stub=env.AUDIT.get(env.AUDIT.idFromName(stream));
    return stub.fetch('https://audit.internal/audit');
   }
   if(u.pathname!=='/api/execute'||request.method!=='POST')return reply({ok:false,error:'Not found'},404);
   const data=await body(request);
   const checked=parseRequest(data);
   if(READ_ONLY_PROOF_STREAMS.has(checked.stream))
    return reply({ok:false,error:'This verified proof notebook is read-only; create a new notebook.',transactionBroadcast:false},403);
   const stub=env.AUDIT.get(env.AUDIT.idFromName(checked.stream));
   return stub.fetch('https://audit.internal/execute',{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  }catch(e){return reply({ok:false,decision:'DENY',reason:'INPUT_REJECTED',
   error:String(e.message||e).slice(0,300),transactionBroadcast:false},400)}
 }
};