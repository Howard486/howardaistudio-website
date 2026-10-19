import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
test('Clock In starts pairing',()=>assert.match(app,/if\(!state\.demo&&!state\.connected\)\{requestPairing\(\);return;\}/));
test('Handshake awaited before pairing reports success',()=>{assert.match(app,/await waitAuth/);assert.match(app,/if\(ok\)\{log\('Office 已完成/);});
test('UI contains explicit Agent pairing',()=>assert.match(page,/連線／配對 Agent/));
test('Site explains loopback permission',()=>assert.match(app,/本機網路權限/));
test('Duplicate notifications are throttled',()=>assert.match(app,/lastToast\.text===text/));

test('HTTP fallback uses the owner-approved pairing token',()=>{
 assert.match(app,/async function connectHttpAgent\(\)/);
 assert.match(app,/fetch\(`\$\{AGENT_BASE\}\/api\/status`/);
 assert.match(app,/headers:\{Authorization:'Bearer '\+state\.token\}/);
 assert.match(app,/const fallback=await connectHttpAgent\(\)/);
});
test('HTTP Clock In and Out include authorized local endpoints',()=>{
 assert.match(app,/async function runHttpClockIn\(\)/);
 assert.match(app,/async function runHttpClockOut\(\)/);
 assert.match(app,/state\.transport==='http'\)\{runHttpClockIn\(\)/);
 assert.match(app,/state\.transport==='http'\)runHttpClockOut\(\)/);
});
