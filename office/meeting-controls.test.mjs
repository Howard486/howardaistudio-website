import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const folder=path.dirname(fileURLToPath(import.meta.url));
const src=fs.readFileSync(path.join(folder,'app.js'),'utf8');
const html=fs.readFileSync(path.join(folder,'index.html'),'utf8');
const bat=fs.readFileSync(path.join(folder,'start-agent.bat'),'utf8');
test('stop buttons persist outside replaced modal content',()=>{
 assert.match(html,/id="global-stop-meeting"/);
 assert.match(html,/id="modal-stop-meeting"/);
 assert.ok(html.indexOf('id="modal-stop-meeting"')<html.indexOf('id="modal-content"'));
 assert.match(src,/'modal-stop-meeting'\)\.addEventListener\('click',requestStopMeeting\)/);
});
test('cancel stops ongoing manual meeting and is idempotent',()=>{
 const m=src.match(/function requestStopMeeting\(\)\{[\s\S]*?\n\}/);
 assert.ok(m);
 const controller=new AbortController(),activity=[],alerts=[];
 const ctx={state:{running:true,abort:controller},log:x=>activity.push(x),toast:x=>alerts.push(x)};
 vm.createContext(ctx);
 vm.runInContext(m[0],ctx);
 assert.equal(vm.runInContext('requestStopMeeting()',ctx),true);
 assert.equal(controller.signal.aborted,true);
 assert.equal(vm.runInContext('requestStopMeeting()',ctx),false);
 assert.equal(alerts.length,1);
 assert.equal(activity.length,1);
 assert.match(src,/function hideModal\(\)\{if\(state\.running\)\{requestStopMeeting\(\);return;\}/);
 assert.match(src,/if\(ctx\.signal\?\.aborted\)\{reject\(/);
 assert.match(src,/state\.abort\.signal\.addEventListener\('abort',\(\)=>reject/);
});
test('Windows batch launcher requires EXE and is downloadable',()=>{
 assert.match(html,/href="\/office\/start-agent\.bat" download="start-agent\.bat"/);
 assert.match(bat,/HVASecretaryAgent\.exe/);
 assert.doesNotMatch(bat,/pip install|Invoke-WebRequest|curl |wget /i);
});

test("Agent download targets v0.7 Windows preview and BAT supports matching EXE",()=>{
 assert.match(html,/artifacts\/12326137799/);
 assert.match(html,/下載 Agent v0\.7/);
 assert.doesNotMatch(html,/artifacts\/12207520129/);
 assert.match(bat,/HVASecretaryAgent-v07\.exe/);
 assert.match(bat,/HVASecretaryAgent\.exe/);
 assert.match(bat,/Extract BOTH ZIP layers/);
});
