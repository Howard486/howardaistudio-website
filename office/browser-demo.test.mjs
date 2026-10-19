import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
test('v0.6 demo is explicit query-gated and uses owner-paired Agent',()=>{
 assert.match(app,/BROWSER_DEMO_ALLOWED=new URLSearchParams/);
 assert.match(app,/if\(!BROWSER_DEMO_ALLOWED\)/);
 assert.match(app,/if\(!state\.connected\|\|!state\.token\)/);
 assert.match(app,/Authorization:'Bearer '\+state\.token/);
});
test('only owned mock test mode is labeled and recorded',()=>{
 assert.match(app,/Browser Runner v0\.6（僅本機模擬網頁，非真正 AI）/);
 assert.match(app,/模擬 AI 網頁；3 個虛擬角色/);
 assert.match(app,/agent_id:'mock-'\+x\.role/);
 assert.match(app,/await saveMeeting\(session\)/);
});
test('stop control forwards cancel to the Agent via paired transport',()=>{
 assert.match(app,/const cancelRemote=\(\)=>/);
 assert.match(app,/\/api\/demo\/meeting\/'\+encodeURIComponent\(remoteId\)\+'\/cancel'/);
 assert.match(app,/controller\.signal\.addEventListener\('abort',cancelRemote/);
});
