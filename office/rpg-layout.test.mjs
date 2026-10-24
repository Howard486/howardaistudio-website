import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('./rpg-theme.css',import.meta.url),'utf8');
const js=readFileSync(new URL('./rpg-ui.js',import.meta.url),'utf8');

test('RPG layout retains all critical Office app.js attachment points',()=>{
 const ids=['global-stop-meeting','demo-toggle','clock-button','clock','office-state','connection-label',
 'refresh-agent','office-scene','room-population','scene-context','activity-list','quick-meet','quick-history',
 'quick-meeting','quick-topic','quick-chair','quick-attendees','quick-mode','quick-rounds','agent-list',
 'mode-preview','modal-backdrop','modal-title','modal-kicker','modal-content','modal-close','modal-stop-meeting',
 'rail-meet','rail-history','rail-help','toast-region'];
 for(const id of ids)assert.match(html,new RegExp('id="'+id+'"'),id);
 const all=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(all).size,all.length,'Duplicate DOM IDs');
});

test('Original SaaS meeting routes remain included and no paid API is added',()=>{
 assert.match(html,/value="chatgpt"/);
 assert.match(html,/value="gemini"/);
 assert.match(html,/value="perplexity"/);
 assert.match(html,/value="claude"/);
 assert.match(html,/value="copilot"/);
 assert.match(html,/form="quick-meeting"/);
 assert.match(html,/id="quick-topic" maxlength="2500"/);
 assert.match(html,/id="quick-rounds">[\s\S]*?<option value="2" selected>/);
 assert.match(html,/\/office\/app\.js/);
 assert.doesNotMatch(js,/\bfetch\s*\(/);
});

test('Visual references are local assets and responsive media queries exist',()=>{
 for(const filename of ['rpg-hero.webp','rpg-scenes.webp']){
   const path=new URL('./assets/'+filename,import.meta.url);
   assert.ok(existsSync(path),filename+' missing');
   const buf=readFileSync(path);
   assert.equal(buf.toString('ascii',0,4),'RIFF',filename);
   assert.equal(buf.toString('ascii',8,12),'WEBP',filename);
   assert.equal(buf.readUInt32LE(4)+8,buf.length,filename+' RIFF length mismatch');
 }
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(html,/SECRETARY PROFILES/);
 assert.match(html,/Start Meeting/);
});

test('Visual-only controller synchronizes actual existing selects',()=>{
 assert.match(js,/chair\.value=n\.dataset\.chair/);
 assert.match(js,/mode\.value=n\.dataset\.mode/);
 assert.match(js,/round\.value=String\(Math\.max\(1,Math\.min\(5/);
 assert.match(js,/node\.open=true/);
});
