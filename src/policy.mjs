import {Interface,getAddress,parseUnits,formatUnits} from 'ethers';
import defaultPolicy from '../config/policy.json' with {type:'json'};
export const NETWORK={chainId:688689,rpc:'https://atlantic.dplabs-internal.com'};
export const DEFAULT_ACCOUNT='0x74B2c2E4E4B771F0C75dcE44f40787468E323f79';
export const SAGA_ABI=new Interface([
 'function pending(address) view returns (uint256)',
 'function deposited(address) view returns (uint256)',
 'function tokenA() view returns (address)'
]);
const validAmount=(value)=>{
 const str=String(value??'');
 if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(str))throw Error('requestedSpendPhrs must be nonnegative decimal');
 const parsed=parseUnits(str,18);
 if(parsed>parseUnits('10000',18))throw Error('requestedSpendPhrs outside demonstration range');
 return {str,wei:parsed};
};
export function validatePolicy(raw=defaultPolicy){
 if(!raw||typeof raw!=='object'||raw.chainId!==688689)throw Error('Policy must target Atlantic 688689');
 const rules=raw.rules;
 if(!rules||!Array.isArray(rules.allowedContracts)||!Array.isArray(rules.allowedMethods))throw Error('Missing policy rules');
 const max=validAmount(rules.maxProposedSpendPhrs);
 const allowedContracts=rules.allowedContracts.map(getAddress);
 if(!allowedContracts.length||!rules.allowedMethods.length)throw Error('Allowed target and method required');
 const start=rules.utcWindow?.startHour,end=rules.utcWindow?.endHour;
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||start>=24||end<0||end>24)
  throw Error('Invalid UTC window');
 return {version:String(raw.version),chainId:688689,
  rules:{maxProposedSpendPhrs:max.str,allowedContracts,allowedMethods:rules.allowedMethods.map(String),
   utcWindow:{startHour:start,endHour:end}}};
}
export const STATIC_POLICY=validatePolicy(defaultPolicy);
export function parseRequest(body={}){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('JSON object required');
 const requestId=String(body.requestId||'');
 const stream=String(body.stream||'');
 if(!/^[a-zA-Z0-9_-]{10,100}$/.test(requestId))throw Error('Invalid requestId');
 if(!/^[a-zA-Z0-9_-]{10,100}$/.test(stream))throw Error('Invalid stream');
 const a=body.action;
 if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Missing action');
 const amount=validAmount(a.requestedSpendPhrs);
 const target=getAddress(a.target),account=getAddress(a.account);
 const method=String(a.method||'');
 if(!['pending','deposited','tokenA'].includes(method))throw Error('Unsupported read-only method');
 const scenario=String(body.scenario||'standard');
 if(!['standard','denySpend','denyAllowlist','denyTime'].includes(scenario))throw Error('Unsupported scenario');
 return {requestId,stream,scenario,action:{target,account,method,requestedSpendPhrs:amount.str,requestedSpendWei:amount.wei.toString()}};
}
function inWindow(hour,{startHour,endHour}){
 if(startHour===endHour)return false;
 return startHour<endHour?(hour>=startHour&&hour<endHour):(hour>=startHour||hour<endHour);
}
export function evaluate(req,policy=STATIC_POLICY,time=new Date()){
 const hour=time.getUTCHours(),checks=[];
 const passedSpend=BigInt(req.action.requestedSpendWei)<=parseUnits(policy.rules.maxProposedSpendPhrs,18);
 checks.push({rule:'SPEND_LIMIT',passed:passedSpend,observed:req.action.requestedSpendPhrs+' proposed PHRS',expected:'at most '+policy.rules.maxProposedSpendPhrs+' PHRS'});
 const passedList=policy.rules.allowedContracts.some(x=>x.toLowerCase()===req.action.target.toLowerCase())&&policy.rules.allowedMethods.includes(req.action.method);
 checks.push({rule:'ALLOWLIST',passed:passedList,observed:req.action.target+' · '+req.action.method,expected:'target AND method allowed'});
 const window=policy.rules.utcWindow;
 const passedTime=inWindow(hour,window);
 checks.push({rule:'TIME_WINDOW',passed:passedTime,observed:'UTC hour '+hour,
  expected:'UTC window '+window.startHour+':00 – '+window.endHour+':00'});
 const failed=checks.find(x=>!x.passed);
 return {decision:failed?'DENY':'ALLOW',decidedBy:failed?.rule||'ALL_RULES_PASSED',allowed:!failed,
  checks,policyVersion:policy.version,checkedAt:time.toISOString()};
}
export function scenarioRequest(body,base=STATIC_POLICY,now=new Date()){
 const request=parseRequest(body),policy=structuredClone(base);
 if(request.scenario==='denySpend'){
  request.action.requestedSpendPhrs='1';
  request.action.requestedSpendWei=parseUnits('1',18).toString();
 }else if(request.scenario==='denyAllowlist'){
  request.action.target=getAddress('0x000000000000000000000000000000000000dEaD');
 }else if(request.scenario==='denyTime'){
  const start=(now.getUTCHours()+1)%24;
  policy.rules.utcWindow={startHour:start,endHour:(start+1)%24};
 }
 return {request,policy,scenarioIsDemonstration:request.scenario!=='standard'};
}
export function transaction(req){
 const a=req.action;
 return {from:a.account,to:a.target,value:'0x0',data:SAGA_ABI.encodeFunctionData(a.method,a.method==='tokenA'?[]:[a.account])};
}
export function decode(req,output){
 const value=SAGA_ABI.decodeFunctionResult(req.action.method,output)[0];
 return req.action.method==='tokenA'?String(value):formatUnits(value,18);
}
export function publicPolicy(){return STATIC_POLICY}
