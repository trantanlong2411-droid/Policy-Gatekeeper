import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {HTML} from '../src/page.mjs';
test('UI supports all three denials and allowed live RPC actions',()=>{
 for(const id of ['allow','spend','list','time','target','account','method','amount','history','export'])
  assert.ok(HTML.includes('id="'+id+'"'),id);
 assert.match(HTML,/sqlite|SQLite/);
 assert.match(HTML,/read-only/);
});
test('Browser inline JavaScript parses',()=>{
 const scripts=[...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);new Script(scripts[0][1]);
});
