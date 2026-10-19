
// Browser-only IndexedDB persistence. No messages are sent to cloud by this module.
const DB_NAME = 'hva-secretary-office';
const DB_VERSION = 1;
function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB is unavailable'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meetings')) db.createObjectStore('meetings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('idle_dialogues')) db.createObjectStore('idle_dialogues', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact(table, mode, operation) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(table, mode);
      const store = tx.objectStore(table);
      let result;
      try { result = operation(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function saveMeeting(entry) { return transact('meetings', 'readwrite', s => s.put(structuredClone(entry))); }
async function loadMeetings() {
  const records = await transact('meetings', 'readonly', s => s.getAll());
  return (records || []).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
async function deleteMeeting(id) { return transact('meetings', 'readwrite', s => s.delete(id)); }
async function saveDialogue(entry) { return transact('idle_dialogues', 'readwrite', s => s.put(structuredClone(entry))); }
async function loadDialogues() { return (await transact('idle_dialogues', 'readonly', s => s.getAll())) || []; }
function exportMarkdown(entry) {
  const content = `# ${entry.topic}\n\n> Meeting: ${entry.id} | ${entry.mode} | ${entry.created_at}\n\n` +
    (entry.final_markdown || '*No final report.*') + '\n\n---\n## Round transcript\n\n' +
    (entry.rounds_log || []).map(x => `### ${x.phase} — ${x.agent_id}\n\n${x.output}\n`).join('\n');
  return new Blob([content], { type: 'text/markdown;charset=utf-8' });
}

/** Pure orchestration & provider adapters. All model conversations are opt-in manual exchanges or DEMO stubs. */
const AGENTS = Object.freeze([
  {id:'gemini',name:'Ge',platform:'Gemini',role:'首席秘書',tone:'blue',skill:'跨領域整合',url:'https://gemini.google.com/app'},
  {id:'chatgpt',name:'ChatGPT',platform:'ChatGPT',role:'執行長',tone:'emerald',skill:'架構與策略',url:'https://chatgpt.com/'},
  {id:'claude',name:'Claude',platform:'Claude',role:'技術智囊',tone:'amber',skill:'程式與潤飾',url:'https://claude.ai/new'},
  {id:'copilot',name:'Copilot',platform:'Copilot',role:'效率專家',tone:'violet',skill:'M365 工作流程',url:'https://copilot.microsoft.com/'},
  {id:'perplexity',name:'Perplexity',platform:'Perplexity',role:'情報搜查官',tone:'cyan',skill:'資料查證',url:'https://www.perplexity.ai/'}
]);
const AGENT_MAP = Object.fromEntries(AGENTS.map(x=>[x.id,x]));
const MODES = Object.freeze({consensus:'合議找最佳解',debate:'辯論大會',collaborate:'共同協作',relay:'接力作業'});
const DEFAULT_BARKS = [
  {participants:['gemini','claude'],lines:[{speaker:'gemini',text:'咖啡醒腦，決策還是要看證據。'},{speaker:'claude',text:'我先把問題拆成可驗證的假設。'},{speaker:'gemini',text:'那就一起檢查盲點。'}]},
  {participants:['chatgpt','copilot'],lines:[{speaker:'chatgpt',text:'策略要清楚，執行才有節奏。'},{speaker:'copilot',text:'我已把待辦排進今日清單。'},{speaker:'chatgpt',text:'記得把風險也寫進去。'}]},
  {participants:['perplexity','gemini'],lines:[{speaker:'perplexity',text:'這個觀點，我想先找來源佐證。'},{speaker:'gemini',text:'我來彙整已知與未知。'},{speaker:'perplexity',text:'資料不足就明確標記。'}]}
];
const clamp = (s,max=6500) => String(s||'').slice(0,max);
const duration = ms=>new Promise(resolve=>setTimeout(resolve,ms));
const read = (results,id) => results.filter(r=>r.agent_id===id).map(r=>r.output).join('\n\n');
function limitedContexts(rows,max=18000) {
  let text = rows.map(r=>`### ${AGENT_MAP[r.agent_id]?.name||r.agent_id} (${r.phase})\n${r.output}`).join('\n\n');
  if (text.length>max) text = `[先前資料已截斷以避免輸入長度過大]\n` + text.slice(-max);
  return text;
}
function promptFor(phase, topic, agent, context, instruction='', isFinal=false) {
  const header = `你是 ${AGENT_MAP[agent].name}（${AGENT_MAP[agent].skill}）。會議議題：${topic}\n\n`;
  const tasks = {
    P1_PROPOSE:'獨立提出具體且可執行的方案，列出假設、成本與風險。',
    P2_CRITIQUE:'檢視其他與會者的建議：指出盲點、相互矛盾處並提出升級版本。',
    P3_SYNTHESIZE:'擔任主席，整合方案與反駁，提出可驗收的最終決策及待驗證事項。',
    P1_PRO:'扮演正方，提出有證據支持的主要論點。',
    P2_CON:'扮演反方，針對正方的假設與風險提出反證或質疑。',
    P3_REBUTTAL:'針對反方的質疑，修正並防守正方立場。',
    P3_FACTCHECK:'站在獨立查證角度區分有依據與未經核實的主張，清楚標記無法確認事項。',
    P4_VERDICT:'擔任主席，綜合正反觀點作出有條件裁決，列出依據與未解問題。',
    P1_DISPATCH:'擔任主席，請將任務拆給與會成員。僅輸出 JSON：{"tasks":[{"agent_id":"...","task":"..."}]}。',
    P2_EXECUTE:'完成主席指派給你的子任務，提供產出與驗收方法。',
    P3_MERGE:'擔任主席，將所有子任務整合成一致、去重且可落地的文件。',
    STEP:'接手上一棒的成果，保留正確內容並提高完整度，輸出整份更新後文件。'
  };
  return header + tasks[phase] + (context?`\n\n前置資料：\n${clamp(context,20000)}`:'') +
    (instruction?`\n\n老闆最新指令（優先）：${clamp(instruction,1200)}`:'') +
    '\n\n請使用 Markdown，區分事實、假設與待查證內容。' +
    (isFinal ?
      '\n\n請在結論之後以獨立 ```json 區塊附上 {"watercooler_scripts":[{"participants":["gemini","claude"],"lines":[{"speaker":"gemini","text":"散會閒聊一句話"},{"speaker":"claude","text":"回應一句話"}]}]}，至多三組，只寫得體、簡短的散會閒聊；資料來自此次會議，不要額外請求。' : '');
}
function extractJsonTasks(text,assignees) {
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const obj = JSON.parse(match?match[1]:text);
    if (!Array.isArray(obj.tasks)) throw Error('Missing tasks');
    return assignees.map(id=>({agent_id:id,task:clamp(obj.tasks.find(t=>t.agent_id===id)?.task||`請執行與 ${AGENT_MAP[id].skill} 相關的子任務。`,1500)}));
  } catch { return assignees.map(id=>({agent_id:id,task:`針對議題執行 ${AGENT_MAP[id].skill} 子任務，列出成果與驗收條件。`})); }
}
function validateConfig(config) {
  const ids=new Set(config.attendees);
  if (!Object.hasOwn(MODES,config.mode)) throw Error('不支援的會議模式');
  if (!config.topic.trim()||config.topic.length>2500) throw Error('請輸入 1–2500 字的議題');
  if (ids.size!==config.attendees.length||!config.attendees.every(x=>AGENT_MAP[x])) throw Error('參與名單無效');
  if (ids.size<2) throw Error('至少需要兩位與會秘書');
  if (!ids.has(config.chair)) throw Error('主席必須在與會者名單中');
  if (config.mode==='debate' && config.attendees.filter(id=>id!==config.chair && id!=='perplexity').length<2) throw Error('辯論至少需主席以外兩位辯手');
  if (config.mode==='relay' && ids.size<2) throw Error('接力至少需要兩位與會秘書');
  return true;
}
class DemoProvider {
  async respond({agent_id, phase, prompt, task, topic}) {
    await duration(450 + (AGENTS.findIndex(a=>a.id===agent_id)%3)*260);
    const label=AGENT_MAP[agent_id].name;
    if(phase==='P1_DISPATCH') return JSON.stringify({tasks:AGENTS.filter(a=>prompt.includes(a.name)||a.id===agent_id).map(a=>({agent_id:a.id,task:`以${a.skill}專長，為「${topic}」提出可驗收成果。`}))},null,2);
    return `## ${label}｜${phase}\n\n> **示範資料**：這是本地 Mock Provider 產出的流程測試文字，不代表任何外部 AI 的真正回覆。\n\n### 建議方向\n1. 定義「${topic.slice(0,72)}」的可衡量目標。\n2. 以 ${AGENT_MAP[agent_id].skill} 的角度檢視資源與風險。\n3. 設置可追蹤的驗收指標與回復方案。\n\n### 待驗證項目\n- 功能需求與服務權限須在正式環境逐項確認。\n- 跨平台資料流程需取得使用許可。\n${task?`\n**指派子任務：** ${task}\n`:''}`;
  }
}
class ManualProvider {
  constructor(requestManual) { this.requestManual=requestManual; this.queue=Promise.resolve(); }
  async respond(ctx) {
    // Parallel execution phases enqueue human handoffs; only one prompt modal
    // is displayed at a time. This is sequential manual input, not parallel AI execution.
    const current=this.queue.then(()=>{
      if(ctx.signal?.aborted) throw new DOMException('Cancelled','AbortError');
      return this.requestManual(ctx);
    });
    this.queue=current.catch(()=>{});
    return current;
  }
}
/** Events: phase_start, agent_start, agent_complete, phase_complete, complete, cancelled. */
class MeetingOrchestrator {
  constructor({provider,onEvent=()=>{},onBreak=()=>Promise.resolve(),signal}={}) {
    this.provider=provider;this.onEvent=onEvent;this.onBreak=onBreak;this.signal=signal;
  }
  checkAbort() {if(this.signal?.aborted) throw new DOMException('Meeting cancelled','AbortError');}
  async execute(config) {
    validateConfig(config);
    const rows=[], group=config.attendees, others=group.filter(id=>id!==config.chair);
    const session={id:`mtg_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,created_at:new Date().toISOString(),topic:config.topic,chair:config.chair,attendees:[...group],mode:config.mode,rounds_log:rows,final_markdown:'',watercooler_scripts:[]};
    let lastInstruction='';
    const runPhase=async(phase, people, makeContext) => {
      this.checkAbort(); this.onEvent({type:'phase_start',phase,people});
      const response=await Promise.all(people.map(async id=>{
        this.checkAbort();
        const context=makeContext(id);
        const prompt=promptFor(phase,config.topic,id,context,lastInstruction,['P3_SYNTHESIZE','P4_VERDICT','P3_MERGE'].includes(phase)||(phase==='STEP'&&id===config.chair));
        this.onEvent({type:'agent_start',phase,agent_id:id,prompt});
        let output=await this.provider.respond({agent_id:id,phase,prompt,topic:config.topic,task:phase==='P2_EXECUTE'?context:'',signal:this.signal});
        this.checkAbort();output=clamp(output,120000);
        if(!output.trim()) throw Error(`${AGENT_MAP[id].name} 沒有輸出內容`);
        const result={phase,agent_id:id,prompt,output,completed_at:new Date().toISOString()};
        rows.push(result);this.onEvent({type:'agent_complete',...result});return result;
      }));
      this.onEvent({type:'phase_complete',phase,results:response});
      return response;
    };
    const breakBeforeNext=async phase=>{
      this.checkAbort();
      const result=await this.onBreak({nextPhase:phase,rounds:rows});
      this.checkAbort(); lastInstruction=clamp(result||'',1200);
    };
    try {
      if(config.mode==='consensus') {
        const p1=await runPhase('P1_PROPOSE',group,()=> '');
        await breakBeforeNext('P2_CRITIQUE');
        const p2=await runPhase('P2_CRITIQUE',group,id=>limitedContexts(p1.filter(r=>r.agent_id!==id)));
        await breakBeforeNext('P3_SYNTHESIZE');
        await runPhase('P3_SYNTHESIZE',[config.chair],()=>limitedContexts([...p1,...p2]));
      } else if(config.mode==='debate') {
        const debaters=others.filter(id=>id!=='perplexity');const pro=debaters.filter((_,i)=>i%2===0),con=debaters.filter((_,i)=>i%2===1);
        const p1=await runPhase('P1_PRO',pro,()=>'');
        await breakBeforeNext('P2_CON');const p2=await runPhase('P2_CON',con,()=>limitedContexts(p1));
        await breakBeforeNext('P3_REBUTTAL');const p3=await runPhase('P3_REBUTTAL',pro,()=>limitedContexts([...p1,...p2]));
        if(group.includes('perplexity')&&config.chair!=='perplexity') {
          await breakBeforeNext('P3_FACTCHECK');await runPhase('P3_FACTCHECK',['perplexity'],()=>limitedContexts([...p1,...p2,...p3]));
        }
        await breakBeforeNext('P4_VERDICT');await runPhase('P4_VERDICT',[config.chair],()=>limitedContexts(rows));
      } else if(config.mode==='collaborate') {
        const p1=await runPhase('P1_DISPATCH',[config.chair],()=>`與會者：${others.map(id=>`${id}(${AGENT_MAP[id].skill})`).join('、')}`);
        const jobs=extractJsonTasks(p1[0].output,others);
        await breakBeforeNext('P2_EXECUTE');await runPhase('P2_EXECUTE',others,id=>jobs.find(job=>job.agent_id===id)?.task||'執行子任務');
        await breakBeforeNext('P3_MERGE');await runPhase('P3_MERGE',[config.chair],()=>limitedContexts(rows));
      } else {
        const order=[...others,config.chair];
        for(let i=0;i<order.length;i++) {
          if(i) await breakBeforeNext(`STEP_${i+1}`);
          await runPhase('STEP',[order[i]],()=>i?read(rows,order[i-1]):'第一棒：請建立初稿。');
        }
      }
      session.final_markdown=rows.at(-1)?.output||'';
      this.onEvent({type:'complete',session});
      return session;
    } catch(e) {this.onEvent({type:e.name==='AbortError'?'cancelled':'error',message:e.message});throw e;}
  }
}


const T=32, W=30, H=19;
const BLOCKS=[
  {x:2,y:3,w:4,h:2,kind:'desk'}, {x:2,y:8,w:4,h:2,kind:'desk'},
  {x:23,y:3,w:4,h:2,kind:'desk'}, {x:23,y:8,w:4,h:2,kind:'desk'},
  {x:11,y:5,w:8,h:7,kind:'meeting'},
  {x:1,y:14,w:4,h:2,kind:'shelf'}, {x:24,y:14,w:4,h:2,kind:'coffee'}
];
const STATIONS={gemini:[7,5],chatgpt:[21,5],claude:[7,10],copilot:[21,10],perplexity:[20,15]};
const SEATS=[[13,4],[16,4],[19,7],[16,12],[11,12]];
const POIS=[[6,15],[23,15],[8,3],[21,3],[9,15],[20,12],[7,12],[22,12],[15,15]];
const COLORS={gemini:['#395d9c','#1d2949','#1e283f'],chatgpt:['#20a178','#103c34','#23394a'],claude:['#d59a68','#73533a','#6c4831'],copilot:['#8a7cce','#565780','#342b53'],perplexity:['#41b8bc','#195b66','#303c50']};
function isBlocked(x,y) {
  if(x<1||y<2||x>28||y>17)return true;
  return BLOCKS.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h);
}
const key=(x,y)=>x+','+y;
function astar([sx,sy],[tx,ty]) {
  if(isBlocked(tx,ty))return [];
  const open=[{x:sx,y:sy,g:0,h:Math.abs(tx-sx)+Math.abs(ty-sy),p:null}],closed=new Set();
  while(open.length) {
    open.sort((a,b)=>(a.g+a.h)-(b.g+b.h));const n=open.shift();
    if(closed.has(key(n.x,n.y)))continue;
    if(n.x===tx&&n.y===ty){const out=[];let p=n;while(p?.p){out.unshift([p.x,p.y]);p=p.p;}return out;}
    closed.add(key(n.x,n.y));
    for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const x=n.x+dx,y=n.y+dy;if(isBlocked(x,y)||closed.has(key(x,y)))continue;
      open.push({x,y,g:n.g+1,h:Math.abs(tx-x)+Math.abs(ty-y),p:n});
    }
  } return [];
}
function px(ctx,x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function random(n){return Math.floor(Math.random()*n);}
class OfficeScene {
  constructor(canvas,{onMeetingClick=()=>{},onBubble=()=>{},onAgentClick=()=>{}}={}) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.ctx.imageSmoothingEnabled=false;
    this.agents=AGENTS.map((a,i)=>({id:a.id,x:14+i%3,y:16+Math.floor(i/3),path:[],state:'OFFLINE',next:Date.now()+4000,face:1,bubble:'',bubbleUntil:0}));
    this.player={x:15,y:16,path:[],face:1};this.meeting=false;this.clockedIn=false;this.barks=DEFAULT_BARKS;this.onMeetingClick=onMeetingClick;this.onBubble=onBubble;this.onAgentClick=onAgentClick;this.lastBark=0;this.lastFrame=0;
    this.halo=0;this.isActive=true;
    canvas.addEventListener('click',event=>this.click(event));
    this.loop=(t)=>{if(!this.isActive)return;const dt=Math.min(0.06,(t-this.lastFrame)/1000||0.016);this.lastFrame=t;this.tick(dt);this.draw(t);requestAnimationFrame(this.loop);};requestAnimationFrame(this.loop);
  }
  setBarks(scripts){this.barks=scripts?.length?scripts:DEFAULT_BARKS;}
  setStatus(status){
    this.clockedIn=status;
    this.agents.forEach((a,i)=>{a.state=status?'IDLE_AT_DESK':'OFFLINE';a.path=[];a.next=Date.now()+2000+i*400;const p=status?STATIONS[a.id]:[14+i%3,16+Math.floor(i/3)];a.x=p[0];a.y=p[1];});
  }
  setMeeting(on,ids=[]){
    this.meeting=on;
    if(on){this.agents.forEach((a,i)=>{if(ids.includes(a.id)&&this.clockedIn){const s=SEATS[i];a.path=astar([Math.round(a.x),Math.round(a.y)],s);a.state='IN_MEETING';}else if(this.clockedIn){a.state='IDLE_AT_DESK';}});}
    else this.agents.forEach(a=>{if(this.clockedIn){a.state='IDLE_AT_DESK';a.next=Date.now()+3000;a.path=astar([Math.round(a.x),Math.round(a.y)],STATIONS[a.id]);}});
  }
  bubble(id,text,ms=3200){const a=this.agents.find(x=>x.id===id);if(a){a.bubble=String(text).replace(/\s+/g,' ').slice(0,34);a.bubbleUntil=Date.now()+ms;this.onBubble(id,text);}}
  tick(dt){
    const move=(entity,speed)=>{if(entity.path?.length){const [tx,ty]=entity.path[0],dx=tx-entity.x,dy=ty-entity.y,d=Math.hypot(dx,dy);if(d<=speed*dt){entity.x=tx;entity.y=ty;entity.path.shift();}else{entity.x+=dx/d*speed*dt;entity.y+=dy/d*speed*dt;if(dx)entity.face=dx>0?1:-1;}}};
    move(this.player,4.3);
    for(const a of this.agents){if(a.state==='OFFLINE')continue;move(a,a.state==='IN_MEETING'?4.8:1.7);
      if(!this.meeting&&!a.path.length&&Date.now()>a.next){
        const targets=[STATIONS[a.id],...POIS];let dst=targets[random(targets.length)];a.path=astar([Math.round(a.x),Math.round(a.y)],dst);a.state='ROAMING_TO_POI';a.next=Date.now()+14000+random(9000);
      }
    }
    if(!this.meeting&&this.clockedIn&&Date.now()-this.lastBark>25000){
      const active=this.agents.filter(a=>a.state!=='OFFLINE');
      for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++) {
        if(Math.hypot(active[i].x-active[j].x,active[i].y-active[j].y)<2.1){
          const script=this.barks.find(s=>s.participants?.includes(active[i].id)&&s.participants?.includes(active[j].id))||this.barks[random(this.barks.length)];
          if(script?.lines?.length){this.lastBark=Date.now();script.lines.slice(0,3).forEach((l,k)=>setTimeout(()=>{if(!this.meeting)this.bubble(l.speaker,l.text,2500);},k*2600));return;}
        }
      }
    }
  }
  click(event){
    const rect=this.canvas.getBoundingClientRect();const x=(event.clientX-rect.left)*this.canvas.width/rect.width/T,y=(event.clientY-rect.top)*this.canvas.height/rect.height/T;
    const agent=this.agents.find(a=>a.state!=='OFFLINE'&&Math.hypot(x-a.x-.5,y-a.y-.5)<1.1);
    if(agent){this.onAgentClick(agent.id);return;}
    if(x>=10.5&&x<=20&&y>=4.7&&y<=13){this.onMeetingClick();return;}
    const target=[Math.floor(x),Math.floor(y)];if(!isBlocked(...target))this.player.path=astar([Math.round(this.player.x),Math.round(this.player.y)],target);
  }
  draw(time){
    const c=this.ctx;
    c.fillStyle='#15243a';c.fillRect(0,0,960,608);
    // tiles + carpet
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const inside=x>0&&x<29&&y>1&&y<18;
      px(c,x*T,y*T,T,T,inside?((x+y)%2?'#202e45':'#22324a'):'#0e1b2c');
      if(inside){px(c,x*T,y*T,1,T,'#ffffff05');px(c,x*T,y*T,T,1,'#ffffff05');}
    }
    for(let x=0;x<30;x++){px(c,x*T,39,31,24,'#172c41');px(c,x*T,39,31,4,'#324860');}
    // windows
    for(let x of [4,10,20,26]){px(c,x*T,8,84,34,'#365773');px(c,x*T+4,11,76,26,'#84b6c4');px(c,x*T+38,11,3,26,'#365773');}
    // carpet meeting zone
    px(c,10*T,4*T,11*T,9*T,'#2d3b56');px(c,10*T,4*T,11*T,3,'#657894');px(c,10*T,13*T-3,11*T,3,'#657894');
    // plants
    for(const [x,y] of [[1,3],[28,3],[1,16],[28,16],[9,12],[21,12]]) {
      const a=x*T+8,b=y*T+6;px(c,a+4,b+15,17,10,'#a56753');px(c,a+9,b+4,8,17,'#36785c');px(c,a,b+8,26,7,'#4ca37a');px(c,a+6,b,14,12,'#6cae75');
    }
    // stations
    for(const b of BLOCKS){const x=b.x*T,y=b.y*T;if(b.kind==='desk'){
      px(c,x+2,y+9,b.w*T-4,49,'#101c2c');px(c,x,y+5,b.w*T,34,'#96765c');px(c,x,y+5,b.w*T,5,'#b99274');
      px(c,x+32,y-6,46,30,'#111b2e');px(c,x+36,y-3,38,23,'#5ba5aa');px(c,x+46,y+23,19,4,'#182535');
      px(c,x+94,y+13,22,15,'#d9cfc0');px(c,x+96,y+10,17,4,'#48a28d');
    } else if(b.kind==='meeting'){
      px(c,x+13,y+23,b.w*T-28,b.h*T-48,'#131f31');px(c,x+24,y+36,b.w*T-50,b.h*T-72,'#936f5a');px(c,x+32,y+43,b.w*T-67,b.h*T-88,'#ab896e');
      px(c,x+84,y+68,35,25,'#e6b96e');px(c,x+137,y+113,27,23,'#f0d5b2');px(c,x+57,y+123,26,18,'#76c9c7');
    }else if(b.kind==='shelf'){
      px(c,x+1,y-12,126,81,'#6b5245');for(let i=0;i<3;i++){px(c,x+8,y-4+i*22,112,6,'#b79473');for(let j=0;j<11;j++)px(c,x+13+j*9,y-19+i*22,6,15,['#7fc2af','#d2ac7c','#809bd5','#e6b986'][j%4]);}
    }else{px(c,x+4,y+7,115,50,'#526776');px(c,x+10,y-7,33,35,'#182435');px(c,x+16,y-3,19,17,'#71b8ce');px(c,x+50,y+15,27,29,'#cab39e');px(c,x+83,y+7,28,35,'#2f4856');}
    }
    // wall whiteboard
    px(c,12*T,65,6*T,48,'#dce5e6');px(c,12*T+4,70,6*T-8,38,'#e5eef1');px(c,12*T+19,85,52,4,'#68a7aa');px(c,12*T+19,93,82,3,'#b9cbd0');px(c,12*T+112,81,49,16,'#f3ce90');
    // door & logo
    px(c,14*T,18*T-13,64,45,'#121f31');px(c,14*T,18*T-13,64,5,'#6c8ba2');px(c,14*T+10,18*T-8,44,40,'#334c60');px(c,14*T+45,18*T+10,4,5,'#f1c978');
    c.font='bold 15px monospace';c.fillStyle='#79c9cf';c.fillText('HVA  /  OFFICE',20,23);
    c.font='11px monospace';c.fillStyle='#899db2';c.fillText('MEETING • COLLABORATION • INTELLIGENCE',20,584);
    // meeting room halo
    if(this.meeting){this.halo=(Math.sin(time*0.003)+1)/2;c.strokeStyle=`rgba(91,201,190,${0.25+this.halo*.4})`;c.lineWidth=4;c.strokeRect(10*T+5,4*T+4,11*T-10,9*T-8);}
    this.drawPerson(this.player,'boss',time);
    [...this.agents].sort((a,b)=>a.y-b.y).forEach(a=>{if(a.state!=='OFFLINE')this.drawPerson(a,a.id,time);});
    // hotspot tag
    px(c,380,433,197,26,'#111d2adb');c.fillStyle='#b3e7df';c.font='bold 12px monospace';c.fillText('◆ 點選圓桌召開會議',388,451);
  }
  drawPerson(a,id,time){
    const c=this.ctx,x=Math.round(a.x*T+4),y=Math.round(a.y*T+1),coat=COLORS[id]||['#a1b4c5','#344758','#2c3549'];
    const bob=a.path?.length?Math.round(Math.sin(time*.018)*2):0;
    const yy=y+bob;
    px(c,x+4,yy+26,25,5,'#00000055');
    px(c,x+9,yy+18,15,17,coat[0]);px(c,x+8,yy+19,3,14,coat[1]);px(c,x+24,yy+19,3,14,coat[1]);
    px(c,x+11,yy+29,5,7,'#152335');px(c,x+20,yy+29,5,7,'#152335');
    px(c,x+10,yy+4,17,16,'#e5b79d');px(c,x+9,yy+2,19,7,coat[2]);
    px(c,x+11,yy+11,3,3,'#18202d');px(c,x+22,yy+11,3,3,'#18202d');
    if(['claude','perplexity','chatgpt'].includes(id)){px(c,x+10,yy+9,7,2,'#cfdfec');px(c,x+21,yy+9,7,2,'#cfdfec');}
    if(id==='copilot'){px(c,x+6,yy+6,5,12,'#a3b6ec');px(c,x+26,yy+6,5,12,'#a3b6ec');}
    if(id==='gemini'){px(c,x+27,yy+5,7,16,coat[2]);}
    if(id==='boss'){px(c,x+10,yy+19,17,15,'#3ea8aa');px(c,x+8,yy+3,21,7,'#19212a');}
    const name=id==='boss'?'YOU':AGENTS.find(s=>s.id===id)?.name||id;
    c.font='bold 11px monospace';const textWidth=c.measureText(name).width;
    px(c,x+18-textWidth/2-5,yy-17,textWidth+10,15,id==='boss'?'#1b7180':'#182637');
    c.fillStyle='#e6eff4';c.fillText(name,x+18-textWidth/2,yy-6);
    if(a.bubble&&Date.now()<a.bubbleUntil){
      const msg=a.bubble.slice(0,20);const width=Math.min(230,Math.max(60,msg.length*12+18));const bx=Math.max(2,Math.min(960-width-2,x-width/2+12));
      px(c,bx,yy-63,width,31,'#e8f1ee');c.fillStyle='#243849';c.font='12px monospace';c.fillText(msg,bx+9,yy-43);px(c,bx+width/2,yy-32,10,8,'#e8f1ee');
    }
  }
  destroy(){this.isActive=false;}
}




const $=id=>document.getElementById(id);
const make=(tag,attrs={},children=[])=>{const el=document.createElement(tag);for(const [key,value] of Object.entries(attrs)){if(key==='text')el.textContent=value;else if(key==='class')el.className=value;else if(key==='value')el.value=value;else if(key==='title')el.title=value;else el.setAttribute(key,value);}for(const child of children)el.append(child);return el;};
const IS_LOCAL=['127.0.0.1:8765','localhost:8765'].includes(location.host);
const AGENT_BASE=IS_LOCAL?'':'http://127.0.0.1:8765';
const WS_BASE=IS_LOCAL?`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}`:'ws://127.0.0.1:8765';
const state={demo:true,clockedIn:false,ws:null,token:window.__HVA_OWNER_TOKEN__??null,connected:false,agentStatus:{},running:false,abort:null,pauseNext:false,rounds:0,activity:[],liveDialogues:DEFAULT_BARKS};

OfficeScene.prototype.iso=function(x,y,z){return [460+(x-y)*18.3,82+(x+y)*9.15-(z||0)];};
OfficeScene.prototype.click=function(e){
 const r=this.canvas.getBoundingClientRect(),sx=(e.clientX-r.left)*this.canvas.width/r.width,sy=(e.clientY-r.top)*this.canvas.height/r.height;
 const hit=this.agents.find(a=>a.state!=='OFFLINE'&&Math.hypot(sx-this.iso(a.x,a.y)[0],sy-this.iso(a.x,a.y)[1]+20)<27);
 if(hit){this.onAgentClick(hit.id);return;}
 const dx=(sx-460)/18.3,dy=(sy-82)/9.15,x=(dx+dy)/2,y=(dy-dx)/2;
 if(x>10&&x<20&&y>4&&y<13){this.onMeetingClick();return;}
 const target=[Math.round(x),Math.round(y)];
 if(!isBlocked(...target))this.player.path=astar([Math.round(this.player.x),Math.round(this.player.y)],target);
};
OfficeScene.prototype.draw=function(t){
 const c=this.ctx,iso=(x,y,z)=>this.iso(x,y,z);
 c.fillStyle='#233449';c.fillRect(0,0,960,608);
 const poly=(a,col,border)=>{c.beginPath();c.moveTo(...a[0]);a.slice(1).forEach(p=>c.lineTo(...p));c.closePath();c.fillStyle=col;c.fill();if(border){c.strokeStyle=border;c.lineWidth=1.4;c.stroke();}};
 const disk=(x,y,rx,ry,col,stroke)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=col;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}};
 const block=(x,y,w,h,z,col)=>{const q=(a,b)=>iso(a,b,z);poly([q(x,y),q(x+w,y),q(x+w,y+h),q(x,y+h)],col,'#77513a');};
 for(const x of [100,270,600,780]){c.fillStyle='#a7cbd1';c.fillRect(x,22,100,99);c.fillStyle='#d8e8df';c.fillRect(x+8,30,84,83);c.fillStyle='#698e98';c.fillRect(x+46,27,5,91);}
 c.fillStyle='#7e6855';c.fillRect(0,124,960,12);
 poly([iso(0,0),iso(30,0),iso(30,19),iso(0,19)],'#af7754','#3b3a36');
 const wood=['#b77b57','#ac704f','#bb8360','#a96e4e','#c28b65','#b37851'];
 for(let y=0;y<19;y++)for(let x=0;x<30;x++){poly([iso(x,y),iso(x+1,y),iso(x+1,y+1),iso(x,y+1)],wood[(x+y*3)%6],'#946446');}
 const center=iso(15,8.7),X=center[0],Y=center[1];
 disk(X,Y+32,186,92,'#d9bd92','#e8d0a1');disk(X,Y+32,174,84,'#426e6c','#bb9670');disk(X,Y+32,160,76,'#537d77','#dfbd91');
 for(let i=0;i<20;i++){const a=i*Math.PI/10;disk(X+Math.cos(a)*166,Y+32+Math.sin(a)*78,4,2,'#caa078');}
 for(const b of BLOCKS.filter(b=>b.kind==='desk')){
  block(b.x,b.y,b.w,b.h,17,'#ad8869');const q=iso(b.x+1.7,b.y+.7,17);
  c.fillStyle='#304558';c.fillRect(q[0]-16,q[1]-32,37,29);c.fillStyle='#78adb5';c.fillRect(q[0]-12,q[1]-28,29,20);
  c.fillStyle='#e8d2b7';c.fillRect(q[0]+24,q[1],19,13);
 }
 block(1,14,4,2,34,'#725448');block(24,14,4,2,22,'#6e7d78');
 const coffee=iso(25,14,22);c.fillStyle='#2e4b5b';c.fillRect(coffee[0]-9,coffee[1]-38,29,34);c.fillStyle='#91c4c8';c.fillRect(coffee[0]-4,coffee[1]-33,19,14);
 for(const [x,y] of [[3,2],[26,3],[5,13],[26,17]]){const q=iso(x,y);c.fillStyle='#a36c50';c.fillRect(q[0]-9,q[1]-4,18,15);disk(q[0]-5,q[1]-19,11,16,'#4a9067');disk(q[0]+6,q[1]-21,9,15,'#65a46f');}
 c.fillStyle='#e7e6d6';c.fillRect(429,95,181,59);c.fillStyle='#5da5a3';c.fillRect(444,113,70,6);c.fillStyle='#96b5b1';c.fillRect(444,127,112,4);
 disk(X,Y+22,153,68,'#704e3d','#402c27');disk(X,Y+14,151,64,'#c9946e','#a37152');disk(X,Y+9,139,55,'#d6a57c','#e0b18a');
 for(const [dx,dy] of [[-61,-15],[39,12],[73,-10],[-15,35]]){poly([[X+dx-12,Y+dy-6],[X+dx+7,Y+dy-9],[X+dx+15,Y+dy+4],[X+dx-7,Y+dy+8]],'#f0e8db','#ab937f');}
 const people=[this.player,...this.agents.filter(a=>a.state!=='OFFLINE')].sort((a,b)=>a.x+a.y-b.x-b.y);
 people.forEach(a=>{
  const id=a===this.player?'boss':a.id,q=iso(a.x,a.y),x=Math.round(q[0]),y=Math.round(q[1]),pal=COLORS[id]||['#458e99','#253f56','#28334a'];
  disk(x,y+6,16,5,'#322b3455');c.fillStyle='#2c283c';c.fillRect(x-10,y-5,7,14);c.fillRect(x+4,y-5,7,14);
  c.fillStyle=pal[0];c.fillRect(x-13,y-31,27,32);c.fillStyle=pal[1];c.fillRect(x-15,y-26,5,21);c.fillRect(x+11,y-26,5,21);
  c.fillStyle='#ebbc9c';c.fillRect(x-10,y-50,21,21);c.fillStyle=pal[2];c.fillRect(x-12,y-52,25,8);
  c.fillStyle='#1b2c3e';c.fillRect(x-5,y-41,3,3);c.fillRect(x+5,y-41,3,3);
  if(['claude','perplexity','chatgpt'].includes(id)){c.strokeStyle='#3e5560';c.strokeRect(x-8,y-43,9,7);c.strokeRect(x+2,y-43,9,7);}
  if(id==='copilot'){c.fillStyle='#acb0d9';c.fillRect(x-17,y-45,5,15);c.fillRect(x+13,y-45,5,15);}
  const name=id==='boss'?'Boss (You)':AGENTS.find(z=>z.id===id)?.name||id;c.font='bold 12px sans-serif';const w=c.measureText(name).width;
  c.fillStyle='#172b3ce8';c.fillRect(x-w/2-9,y-76,w+18,19);c.strokeStyle='#c7a27d';c.strokeRect(x-w/2-9,y-76,w+18,19);c.fillStyle='#fff4da';c.fillText(name,x-w/2,y-62);
  if(a.bubble&&Date.now()<a.bubbleUntil){c.fillStyle='#fff6e8';c.fillRect(x-83,y-115,166,27);c.fillStyle='#273746';c.fillText(a.bubble.slice(0,12),x-77,y-98);}
 });
 c.fillStyle='#173544';c.fillRect(25,33,158,55);c.fillStyle='#e6f0e1';c.font='bold 16px sans-serif';c.fillText(this.clockedIn?'● 全員已打卡':'○ 尚未打卡',43,65);
 c.fillStyle='#203647da';c.fillRect(340,545,280,34);c.fillStyle='#f4c898';c.font='bold 14px sans-serif';c.fillText('◆ 點選圓桌召開多模型會議',353,567);
 if(this.meeting){disk(X,Y+15,160,71,'#00000000','#ffe5ac');}
};
const scene=new OfficeScene($('office-scene'),{onMeetingClick:()=>showMeetingForm(),onAgentClick:id=>showAgent(id),onBubble:(id,text)=>{if(text)log(`${AGENT_MAP[id].name}：${text.slice(0,70)}`);}});
function log(message){state.activity.unshift({time:new Date().toLocaleTimeString('zh-TW',{hour12:false}),text:message});state.activity=state.activity.slice(0,30);const root=$('activity-list');root.replaceChildren(...state.activity.slice(0,8).map(item=>make('p',{},[make('time',{text:item.time}),make('span',{text:item.text})])));}
function toast(text){const node=make('div',{class:'toast',text});$('toast-region').append(node);setTimeout(()=>node.remove(),4300);}
function modal(title,kicker='OFFICE CONTROL'){const backdrop=$('modal-backdrop');$('modal-title').textContent=title;$('modal-kicker').textContent=kicker;$('modal-content').replaceChildren();backdrop.classList.remove('hidden');$('modal-close').focus();return $('modal-content');}
function hideModal(){if(state.running){toast('會議執行期間請使用「停止會議」');return;} $('modal-backdrop').classList.add('hidden');}
$('modal-close').addEventListener('click',hideModal);
$('modal-backdrop').addEventListener('click',e=>{if(e.target===$('modal-backdrop'))hideModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideModal();});
function refreshUI(){
  $('clock-button').textContent=state.clockedIn?'◌ 全員下班':'◉ 全員打卡';$('clock-button').classList.toggle('off',state.clockedIn);
  $('demo-toggle').textContent=state.demo?'● 示範模式':'◯ 真實分頁模式';
  $('office-state').textContent=state.running?'● 會議進行中':state.clockedIn?'● 已打卡上班':'● 待機中';
  $('room-population').textContent=`${state.clockedIn?'05':'00'} / 05 ONLINE`;
  $('scene-context').textContent=state.running?'OFFICE STATUS: IN MEETING':state.clockedIn?'OFFICE STATUS: ONLINE':'OFFICE STATUS: IDLE';
  $('connection-label').textContent=state.connected?'● 本機 Agent 已連線':(!IS_LOCAL&&!state.token?'○ 點 ↻ 配對 Agent':'○ 本機 Agent 未連線');
  const list=$('agent-list');list.replaceChildren(...AGENTS.map(agent=>{
    const status=state.demo?(state.clockedIn?'DEMO READY':'OFFLINE'):(state.agentStatus[agent.id]?.status||'NOT_OPEN');
    const ready=status==='TAB_OPEN'||status==='DEMO READY';
    const a=make('button',{class:'agent'});a.append(make('span',{class:`avatar ${agent.tone}`,text:agent.name.charAt(0)}));
    a.append(make('span',{class:'agent-main'},[make('span',{class:'agent-name',text:agent.name}),make('span',{class:'agent-role',text:`${agent.role} · ${agent.skill}`})]));
    a.append(make('span',{class:`agent-status ${ready?'ready':'warn'}`,text:ready?'● READY':'○ '+status.replaceAll('_',' ')}));
    a.addEventListener('click',()=>showAgent(agent.id));return a;
  }));
  $('mode-preview').replaceChildren(make('span',{text:state.running?'◉ 主席正協調多模型會議':'現在沒有進行中的會議'}));
  if(state.running){const b=make('button',{class:'outline-action',text:'⏸ 下一輪暫停／插話'});b.addEventListener('click',()=>{state.pauseNext=true;toast('已設定：下一輪切換時暫停');});$('mode-preview').append(b);}
  else {const b=make('button',{class:'outline-action',text:'＋ 建立新會議 ↗'});b.addEventListener('click',showMeetingForm);$('mode-preview').append(b);}
}
function showAgent(id){if(state.running){toast('會議進行中，請先完成或停止');return;}const a=AGENT_MAP[id],root=modal(`${a.name} · ${a.role}`,'AGENT PROFILE');
 root.append(make('p',{class:'help-text',text:`專長：${a.skill}。點擊網站連結可在原生瀏覽器手動使用 ${a.platform}。目前不會自動讀取帳號、對話或 Cookie。`}));
 const row=make('div',{class:'modal-actions'});const open=make('a',{class:'secondary-button',href:a.url,target:'_blank',rel:'noopener noreferrer',text:`開啟 ${a.platform} ↗`});row.append(open);root.append(row);
}
async function connectAgent(){
  try{
    const res=await fetch(`${AGENT_BASE}/api/health`,{cache:'no-store',signal:AbortSignal.timeout(1800)});if(!res.ok)throw Error('Agent unavailable');
    if(!state.token){log('網頁尚未完成 Agent 授權配對');return;}
    state.ws?.close();const ws=new WebSocket(`${WS_BASE}/ws`);
    state.ws=ws;
    ws.onopen=()=>ws.send(JSON.stringify({action:'AUTH',token:state.token}));
    ws.onmessage=e=>{let data;try{data=JSON.parse(e.data);}catch{return;}
      if(data.event==='AUTH_OK'){state.connected=true;log('本地 Agent 已連接');refreshUI();ws.send(JSON.stringify({action:'REFRESH_STATUS'}));}
      if(data.event==='AGENT_STATUS_UPDATE'){state.agentStatus=data.data?.agents||{};if(state.pendingClockIn){state.pendingClockIn=false;state.clockedIn=Boolean(data.data?.cdp_connected);scene.setStatus(state.clockedIn);if(!state.clockedIn)toast('Chrome 未確認啟動成功');}log('已同步五家 AI 的分頁存在狀態');refreshUI();}
      if(data.event==='CLOCKED_OUT')log('Agent 已完成下班打卡');
      if(data.event==='ERROR'){state.pendingClockIn=false;toast('Agent：'+data.message);}
    };
    ws.onclose=()=>{if(state.ws===ws){state.connected=false;refreshUI();}};
    ws.onerror=()=>{state.connected=false;refreshUI();};
  }catch{state.connected=false;refreshUI();}
}
function clock(){
  if(state.running){toast('請先結束會議，再下班打卡');return;}
  if(!state.clockedIn){
    if(!state.demo&&!state.connected){toast('請先啟動本機 Agent 或改回示範模式');return;}
    if(state.demo){state.clockedIn=true;scene.setStatus(true);log('已開啟離線示範：五位秘書上班');}
    else{state.pendingClockIn=true;state.ws.send(JSON.stringify({action:'CLOCK_IN_ALL'}));log('已向 Agent 送出 Chrome 打卡指令，等待結果');}
  }else{
    if(!state.demo&&state.connected)state.ws.send(JSON.stringify({action:'CLOCK_OUT_ALL',payload:{close_chrome:false}}));
    state.clockedIn=false;scene.setStatus(false);log('五位秘書下班；會議記錄仍保留在本機');
  }refreshUI();
}
async function requestPairing(){
  if(IS_LOCAL)return connectAgent();
  if(state.token)return connectAgent();
  try{
    const response=await fetch(`${AGENT_BASE}/api/pair/request`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(6000)
    });
    if(!response.ok)throw Error(`配對請求失敗（${response.status}）`);
    const data=await response.json();
    const root=modal('連接 Windows Agent','PAIRING / OWNER APPROVAL');
    root.append(make('div',{class:'info-box',text:'請在這台電腦上打開 http://127.0.0.1:8765/，於「配對請求」批准目前網站來源 howardaistudio.com。授權僅在本次 Agent 執行期間有效。'}));
    const status=make('p',{class:'help-text',text:'等待本機控制台核准…'});root.append(status);
    const open=make('a',{class:'secondary-button',href:'http://127.0.0.1:8765/',target:'_blank',rel:'noopener noreferrer',text:'開啟本地核准頁 ↗'});root.append(open);
    const until=Date.now()+120000;
    while(Date.now()<until){
      if($('modal-backdrop').classList.contains('hidden'))return;
      await new Promise(r=>setTimeout(r,1800));
      const poll=await fetch(`${AGENT_BASE}/api/pair/${encodeURIComponent(data.request_id)}/result`,{signal:AbortSignal.timeout(6000)});
      if(!poll.ok)throw Error('配對狀態查詢失敗');
      const result=await poll.json();
      if(result.status==='APPROVED'){
        state.token=result.token;
        $('modal-backdrop').classList.add('hidden');
        await connectAgent();log('外部 Web 已獲本機核准的限時連線');toast('已完成安全配對');return;
      }
      if(['REJECTED','EXPIRED'].includes(result.status))throw Error(`配對 ${result.status}`);
    }
    throw Error('配對逾時，請重新發起');
  } catch(error){toast(`無法連線：${error.message}`);$('modal-backdrop').classList.add('hidden');}
}
$('clock-button').addEventListener('click',clock);
$('demo-toggle').addEventListener('click',()=>{if(state.running||state.clockedIn){toast('請先結束會議並打卡下班後再切換模式');return;}state.demo=!state.demo;refreshUI();toast(state.demo?'已切換為離線示範模式':'已切換為真實分頁／手動交接模式');});
$('refresh-agent').addEventListener('click',()=>{if(!IS_LOCAL&&!state.token)requestPairing();else connectAgent();});
function showMeetingForm(){
  if(state.running){toast('已有會議進行中');return;}
  const root=modal('建立圓桌會議','NEW MEETING / SETUP');
  const form=make('form');
  const topic=make('textarea',{id:'meeting-topic',placeholder:'例如：如何提升 AI Secretary Office 的使用體驗與部署安全？',maxlength:'2500',required:'required'});
  const topicField=make('div',{class:'field'},[make('label',{for:'meeting-topic',text:'會議議題'}),topic]);form.append(topicField);
  form.append(make('div',{class:'field-label',text:'會議模式'}));
  const modeChoice={value:'consensus'};
  const modeDescriptions={consensus:'獨立提案 → 交叉檢視 → 主席整合',debate:'正反攻防 → 查證 → 主席裁決',collaborate:'主席派工 → 分工執行 → 整併',relay:'逐棒接力 → 不斷完善成果'};
  const modes=make('div',{class:'meeting-modes'});Object.entries(MODES).forEach(([id,label])=>{
    const b=make('button',{type:'button',class:`mode-card ${id==='consensus'?'selected':''}`},[make('b',{text:label}),make('small',{text:modeDescriptions[id]})]);
    b.addEventListener('click',()=>{modeChoice.value=id;modes.querySelectorAll('.mode-card').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');});modes.append(b);
  });form.append(modes);
  const group=make('div',{class:'field',style:'margin-top:22px'});group.append(make('label',{text:'與會秘書（至少兩位）'}));
  const chips=make('div',{class:'agent-chips'});AGENTS.forEach(a=>{const label=make('label',{class:'agent-chip'});const check=make('input',{type:'checkbox',value:a.id});check.checked=true;check.addEventListener('change',()=>{const opts=[...chips.querySelectorAll('input:checked')].map(n=>n.value);if(!opts.includes(chair.value))chair.value=opts[0]||'';});label.append(check,make('span',{text:a.name}));chips.append(label);});group.append(chips);form.append(group);
  const chair=make('select',{id:'chair'});AGENTS.forEach(a=>chair.append(make('option',{value:a.id,text:`${a.name} — ${a.role}`})));chair.value='chatgpt';
  const mode=make('select',{id:'exchange-mode'},[make('option',{value:'demo',text:'離線示範（完整自動流程；不呼叫 AI）'}),make('option',{value:'manual',text:'手動交接（真正將回覆貼回會議）'})]);mode.value=state.demo?'demo':'manual';
  form.append(make('div',{class:'modal-grid'},[make('div',{class:'field'},[make('label',{for:'chair',text:'會議主席'}),chair]),make('div',{class:'field'},[make('label',{for:'exchange-mode',text:'內容來源'}),mode])]));
  const warn=make('div',{class:'info-box',text:'示範流程不使用任何外部模型。手動交接流程會提供 Prompt 與站點連結，由你自行在各 AI 網頁產生回答後貼入，不會自動擷取第三方服務內容。'});form.append(warn);
  const actions=make('div',{class:'modal-actions'});const cancel=make('button',{class:'secondary-button',type:'button',text:'取消'});cancel.onclick=hideModal;const submit=make('button',{class:'primary-button',type:'submit',text:'◉ 開始會議'});actions.append(cancel,submit);form.append(actions);root.append(form);
  form.addEventListener('submit',async e=>{e.preventDefault();const config={topic:topic.value.trim(),chair:chair.value,attendees:[...chips.querySelectorAll('input:checked')].map(x=>x.value),mode:modeChoice.value,exchange:mode.value};try{validateConfig(config);}catch(err){toast(err.message);return;}if(!state.clockedIn){state.clockedIn=true;scene.setStatus(true);log('為開始會議，自動啟用本地秘書場景（不啟動第三方操作）');}await startMeeting(config);});
}
function contentBox(text){return make('pre',{class:'report-viewer',text});}
function formatResult(root,session){
  $('modal-title').textContent='會議完成 · 最終報告';$('modal-kicker').textContent=`${MODES[session.mode]} / ${session.id}`;root.replaceChildren();
  root.append(make('div',{class:'info-box',text:'此報告會儲存在目前瀏覽器 IndexedDB。若使用離線示範模式，內容僅為流程測試資料，不等同模型實際建議。'}));
  root.append(contentBox(session.final_markdown));
  const actions=make('div',{class:'modal-actions'});
  const copy=make('button',{class:'secondary-button',text:'複製 Markdown'});copy.onclick=async()=>{try{await navigator.clipboard.writeText(session.final_markdown);toast('已複製 Markdown');}catch{toast('剪貼簿無法使用，請手動選取文字');}};
  const download=make('button',{class:'primary-button',text:'↓ 匯出完整紀錄 .md'});download.onclick=()=>downloadMeeting(session);
  actions.append(copy,download);root.append(actions);
}
function downloadMeeting(session){const blob=exportMarkdown(session),url=URL.createObjectURL(blob),anchor=make('a',{href:url,download:`${session.id}.md`});document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function askManual(ctx){return new Promise((resolve,reject)=>{
  const root=$('modal-content');root.replaceChildren();$('modal-title').textContent=`${AGENT_MAP[ctx.agent_id].name} · 等待交接`;$('modal-kicker').textContent=ctx.phase;
  const hint=make('p',{class:'help-text',text:'1. 複製 Prompt。2. 在對應 AI 網頁自行送出。3. 將回覆貼入下方。此功能不讀取外部網站 DOM 或登入資訊。'});
  const prompt=contentBox(ctx.prompt);prompt.style.maxHeight='170px';
  const answer=make('textarea',{rows:'7',placeholder:'貼上此位秘書的完整 Markdown 回覆…'});
  const field=make('div',{class:'field'},[make('label',{text:'回覆內容（必填）'}),answer]);
  const actions=make('div',{class:'modal-actions'});const open=make('a',{class:'secondary-button',href:AGENT_MAP[ctx.agent_id].url,target:'_blank',rel:'noopener noreferrer',text:'開啟 AI 網頁 ↗'});
  const copy=make('button',{class:'secondary-button',type:'button',text:'複製 Prompt'});copy.onclick=async()=>{try{await navigator.clipboard.writeText(ctx.prompt);toast('已複製 Prompt');}catch{toast('無法自動複製，請選取上方內容');}};
  const submit=make('button',{class:'primary-button',type:'button',text:'提交這一棒 →'});submit.onclick=()=>{if(!answer.value.trim()){toast('請先貼入回覆內容');return;}resolve(answer.value);};
  actions.append(open,copy,submit);root.append(hint,prompt,field,actions);
  ctx.signal?.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});
});}
function parseWatercooler(text){
  const matches=[...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  for(const match of matches){
    try{const x=JSON.parse(match[1]);if(Array.isArray(x.watercooler_scripts))return x.watercooler_scripts.filter(s=>Array.isArray(s.participants)&&s.participants.length===2&&s.participants.every(id=>AGENT_MAP[id])&&Array.isArray(s.lines)&&s.lines.length<=8&&s.lines.every(l=>AGENT_MAP[l.speaker]&&typeof l.text==='string'&&l.text.length<=180)).slice(0,3);}catch{}
  }
  return [];
}
async function startMeeting(config){
  state.running=true;state.abort=new AbortController();state.rounds=0;state.pauseNext=false;
  refreshUI();scene.setMeeting(true,config.attendees);log(`會議開始：${config.topic.slice(0,55)} / ${MODES[config.mode]}`);
  const root=modal('會議執行中','MEETING / IN PROGRESS');
  const progress=make('div',{class:'progress-strip'},[make('span',{class:'progress-dot'}),make('span',{text:'正在建立會議…'})]);
  const transcript=make('div',{class:'activity-list'});transcript.style.maxHeight='230px';
  const pause=make('button',{class:'secondary-button',text:'⏸ 下一輪暫停並插話'});pause.onclick=()=>{state.pauseNext=true;toast('已在下一輪切換點加入暫停');};
  const abort=make('button',{class:'secondary-button',text:'■ 停止會議'});abort.onclick=()=>{state.abort.abort();toast('已請求停止會議');};
  const actions=make('div',{class:'modal-actions'},[pause,abort]);root.append(progress,transcript,actions);
  const events=e=>{
    if(e.type==='phase_start'){progress.lastChild.textContent=`執行階段：${e.phase}（${e.people.map(x=>AGENT_MAP[x].name).join(' / ')}）`;log(`進入 ${e.phase} 階段`);}
    if(e.type==='agent_start'){scene.bubble(e.agent_id,'正在整理 '+e.phase+' …',2400);}
    if(e.type==='agent_complete'){state.rounds++;const row=make('p',{},[make('time',{text:AGENT_MAP[e.agent_id].name}),make('span',{text:`${e.phase} 完成 · ${e.output.length} 字`})]);transcript.prepend(row);scene.bubble(e.agent_id,'本輪完成，準備交接。');log(`${AGENT_MAP[e.agent_id].name} 完成 ${e.phase}`);}
  };
  const onBreak=async({nextPhase})=>{
    if(config.exchange==='demo'&&!state.pauseNext){await new Promise(r=>setTimeout(r,650));return '';}
    state.pauseNext=false;return new Promise((resolve,reject)=>{
      $('modal-title').textContent='會議暫停 · 老闆插話';$('modal-kicker').textContent=`NEXT / ${nextPhase}`;
      root.replaceChildren(make('p',{class:'help-text',text:'請提供下一輪要注意的新指令；不需要補充可直接繼續。已完成的回合不會重新執行。'}));
      const input=make('textarea',{rows:'4',placeholder:'例如：聚焦 Windows 安全性與維運成本…'});root.append(make('div',{class:'field'},[make('label',{text:'新增指令'}),input]));
      const next=make('button',{class:'primary-button',text:'繼續下一輪 →'});next.onclick=()=>{root.replaceChildren(progress,transcript,actions);$('modal-title').textContent='會議執行中';$('modal-kicker').textContent='MEETING / IN PROGRESS';resolve(input.value);};root.append(make('div',{class:'modal-actions'},[next]));
      state.abort.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});
    });
  };
  try{
    const provider=config.exchange==='demo'?new DemoProvider():new ManualProvider(askManual);
    const orchestrator=new MeetingOrchestrator({provider,onEvent:events,onBreak,signal:state.abort.signal});
    const session=await orchestrator.execute(config);
    const scripts=parseWatercooler(session.final_markdown);
    session.watercooler_scripts=scripts;
    if(scripts.length)scene.setBarks(scripts);else scene.setBarks(DEFAULT_BARKS);
    try{await saveMeeting(session);}catch(err){toast(`儲存失敗：${err.message}`);}
    log(`會議完成：${state.rounds} 次秘書交付，已產生最終報告`);formatResult(root,session);
  }catch(err){root.replaceChildren(make('div',{class:'warning-box',text:err.name==='AbortError'?'本次會議已由使用者取消；未完成的紀錄不會保存。':`會議中止：${err.message}`}));log(`會議結束：${err.message}`);}
  finally{state.running=false;state.abort=null;scene.setMeeting(false);refreshUI();}
}
async function showHistory(){if(state.running){toast('請先完成或停止會議');return;}const root=modal('會議歷史紀錄','LOCAL ARCHIVE');let meetings=[];try{meetings=await loadMeetings();}catch(err){root.append(make('p',{class:'warning-box',text:`無法開啟本機資料庫：${err.message}`}));return;}
  if(!meetings.length){root.append(make('div',{class:'info-box',text:'尚無會議紀錄。建立會議後，報告會留在此瀏覽器的 IndexedDB。'}));return;}
  meetings.forEach(session=>{const line=make('div',{class:'session-row'});line.append(make('div',{},[make('strong',{text:session.topic.slice(0,60)}),make('small',{text:`${new Date(session.created_at).toLocaleString('zh-TW')} · ${MODES[session.mode]||session.mode} · ${session.rounds_log?.length||0} 次交付`})]));const actions=make('div',{class:'session-actions'});
    const view=make('button',{class:'mini-button',text:'檢視'});view.onclick=()=>formatResult(root,session);
    const dl=make('button',{class:'mini-button',text:'匯出'});dl.onclick=()=>downloadMeeting(session);
    const del=make('button',{class:'mini-button',text:'刪除'});del.onclick=async()=>{if(!confirm('確定刪除此筆本機會議紀錄？'))return;await deleteMeeting(session.id);showHistory();};actions.append(view,dl,del);line.append(actions);root.append(line);
  });
}
function help(){if(state.running){toast('請先完成或停止會議');return;}const root=modal('操作說明','GETTING STARTED');root.append(make('p',{class:'help-text',text:'① 打卡：示範模式不需本地 Agent，五位秘書會自行漫遊。② 點選圓桌建立會議，選擇主席、與會者與四種模式。③ 示範模式會跑完整狀態機但不呼叫外部 AI；手動交接模式會產出提示詞，讓你自行到各網站操作並貼回 Markdown。④ 會議完成可複製報告、匯出 .md、回放歷史。⑤ 真實分頁管理須先安裝並啟動 HVA Windows Agent。'}));root.append(make('div',{class:'warning-box',text:'限制：網站分頁存在不代表已登入；本 MVP 不自動讀取或操作第三方 AI 網頁，也不保證「零成本」，各服務仍有使用額度或訂閱限制。'}));}
for(const id of ['rail-meet','quick-meet'])$(id).addEventListener('click',showMeetingForm);
for(const id of ['rail-history','quick-history'])$(id).addEventListener('click',showHistory);
$('rail-help').addEventListener('click',help);
setInterval(()=>$('clock').textContent=new Date().toLocaleTimeString('zh-TW',{hour12:false}),1000);
$('clock').textContent=new Date().toLocaleTimeString('zh-TW',{hour12:false});
log('系統啟動：像素辦公室場景已載入');refreshUI();if(IS_LOCAL)connectAgent();



document.getElementById('quick-meeting').addEventListener('submit',async e=>{
 e.preventDefault();if(state.running){toast('會議進行中');return;}
 const f=e.currentTarget;
 const cfg={topic:f.querySelector('#quick-topic').value.trim(),chair:f.querySelector('#quick-chair').value,attendees:[...f.querySelectorAll('#quick-attendees input:checked')].map(x=>x.value),mode:f.querySelector('#quick-mode').value,exchange:state.demo?'demo':'manual'};
 try{validateConfig(cfg)}catch(err){toast(err.message);return;}
 if(!state.clockedIn){state.clockedIn=true;scene.setStatus(true);log('啟動本地秘書場景');}
 await startMeeting(cfg);
});
