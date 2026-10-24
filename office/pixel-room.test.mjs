import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("./app.js",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("./styles.css",import.meta.url),"utf8");
const art=fs.readFileSync(new URL("./pixel-room.js",import.meta.url),"utf8");
test("only meeting canvas is restyled, original layout and five-model form restored",()=>{
 for(const id of ["office-scene","quick-meeting","quick-topic","quick-chair","quick-mode","quick-rounds","agent-list","modal-backdrop","rail-meet","rail-history","global-stop-meeting","connection-label"]){
   assert.match(html,new RegExp('id="'+id+'"'),"missing "+id);
 }
 assert.match(html,/<select id="quick-rounds">[\s\S]*?<option value="2" selected>/);
 assert.match(html,/\/office\/styles\.css/);
 assert.match(html,/\/office\/app\.js/);
 assert.match(html,/\/office\/pixel-room\.js/);
 assert.doesNotMatch(html,/rpg-theme|rpg-ui|rpg-hero|SECRETARY PROFILES/);
 for(const provider of ["chatgpt","gemini","perplexity","claude","copilot"]){
   assert.match(html,new RegExp('value="'+provider+'"'));
 }
});
test("original agent/meeting source untouched and pixels are on separate layer",()=>{
 assert.match(app,/class MeetingOrchestrator/);
 assert.match(app,/class OfficeScene/);
 assert.match(app,/OfficeScene\.prototype\.click=/);
 assert.match(art,/OfficeScene\.prototype\.draw=function\(t\)/);
 assert.match(art,/img\.src=source/);
 assert.match(art,/\/office\/assets\/hva-meeting-room\.webp/);
 assert.match(art,/const W=960,H=608/);
 assert.match(art,/scaleImageToCanvas/);
 assert.doesNotMatch(art,/fetch\(|XMLHttpRequest|WebSocket|localStorage|eval\(/);
 assert.match(css,/#office-scene\{image-rendering:auto/);
 assert.match(html,/下載 Agent \(Windows ZIP\)/);
 assert.match(html,/artifacts\/12207520129/);
});
