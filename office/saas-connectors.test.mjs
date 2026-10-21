import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');

test('v0.7 SaaS status is informational and requires paired Agent',()=>{
 assert.match(html,/id="saas-connector-status"/);
 assert.match(app,/async function showSaasConnectorStatus/);
 assert.match(app,/if\(!state\.connected\|\|!state\.token\)/);
 assert.match(app,/\/api\/saas\/connectors/);
 assert.match(app,/Authorization:'Bearer '\+state\.token/);
});
test('UI is transparent about no real autonomous SaaS access',()=>{
 assert.match(app,/尚未提供自動收發/);
 assert.match(app,/尚未連上真實自動會議/);
 assert.match(app,/不進行 ChatGPT／Gemini 登入/);
});
