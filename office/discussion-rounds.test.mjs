import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const start=code.indexOf('function validateConfig(config) {');
const end=code.indexOf('\n\nconst T=32',start);
assert.ok(start>=0&&end>start,'Orchestration section cannot be found');
const ids=['gemini','chatgpt','claude','perplexity'];
const AGENTS=ids.map(id=>({id,name:id,skill:id}));
const AGENT_MAP=Object.fromEntries(AGENTS.map(x=>[x.id,x]));
const MODES={consensus:'consensus',debate:'debate',collaborate:'collaborate',relay:'relay'};
const deps={AGENTS,AGENT_MAP,MODES,clamp:(str,max)=>String(str||'').slice(0,max),duration:async()=>{},
 limitedContexts:rows=>rows.map(x=>x.output).join('\n'),
 promptFor:(phase,topic,id,ctx,instruction)=>[phase,topic,id,ctx,instruction].join('\n'),
 extractJsonTasks:(_,assignees)=>assignees.map(id=>({agent_id:id,task:'Do '+id})),
 read:(rows,id)=>rows.filter(x=>x.agent_id===id).map(x=>x.output).join('\n')};
const engine=Function('deps','const {AGENTS,AGENT_MAP,MODES,clamp,duration,limitedContexts,promptFor,extractJsonTasks,read}=deps;\n'+code.slice(start,end)+'\nreturn {validateConfig,MeetingOrchestrator};')(deps);
async function run(mode,rounds=2){
 const config={topic:'Optimize assistant workflows',mode,chair:'chatgpt',attendees:ids,discussionRounds:rounds};
 const provider={respond:async x=>x.agent_id+': '+x.phase};
 return await new engine.MeetingOrchestrator({provider,onBreak:async()=>''}).execute(config);
}
test('quick meeting panel defaults to 2 discussion rounds',()=>{
 assert.match(html,/<select id="quick-rounds">[\s\S]*?<option value="2" selected>/);
 assert.match(code,/id:'discussion-rounds'/);
 assert.match(code,/rounds\.value='2'/);
});
test('invalid round counts are rejected',()=>{
 const c={topic:'research',mode:'consensus',chair:'chatgpt',attendees:ids};
 for(const bad of [0,6,-1,2.5,NaN])assert.throws(()=>engine.validateConfig({...c,discussionRounds:bad}));
 assert.equal(engine.validateConfig({...c,discussionRounds:2}),true);
});
test('consensus performs exactly two critique rounds before synthesizing',async()=>{
 const result=await run('consensus');
 const critics=result.rounds_log.filter(x=>x.phase==='P2_CRITIQUE');
 assert.equal(result.discussion_rounds,2);
 assert.equal(critics.length,8);
 assert.equal(critics.filter(x=>x.discussion_round===1).length,4);
 assert.equal(critics.filter(x=>x.discussion_round===2).length,4);
 assert.equal(result.rounds_log.at(-1).phase,'P3_SYNTHESIZE');
});
test('debate repeats counterarguments and rebuttals twice',async()=>{
 const rows=(await run('debate')).rounds_log;
 assert.equal(rows.filter(x=>x.phase==='P2_CON').length,2);
 assert.equal(rows.filter(x=>x.phase==='P3_REBUTTAL').length,2);
 assert.equal(rows.at(-1).phase,'P4_VERDICT');
});
test('collaboration runs two execution iterations',async()=>{
 const rows=(await run('collaborate')).rounds_log;
 assert.equal(rows.filter(x=>x.phase==='P2_EXECUTE').length,6);
 assert.equal(rows.at(-1).phase,'P3_MERGE');
});
test('relay passes each participant twice',async()=>{
 const rows=(await run('relay')).rounds_log;
 assert.equal(rows.filter(x=>x.phase==='STEP').length,8);
 assert.deepEqual(rows.filter(x=>x.discussion_round===2).map(x=>x.agent_id),['gemini','claude','perplexity','chatgpt']);
});
test('guided browser handoff requires user send and paste',()=>{
 assert.match(code,/window\.open\(AGENT_MAP\[ctx\.agent_id\]\.url/);
 assert.match(code,/navigator\.clipboard\.writeText\(ctx\.prompt\)/);
 assert.match(code,/navigator\.clipboard\.readText\(\)/);
 assert.match(code,/請在該站貼上、送出/);
});
