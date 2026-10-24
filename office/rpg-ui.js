/* HowardAI Studio RPG visual shell — enhancements only; original app.js retains all business logic. */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  function run(action){
    if(action==="home"){window.scrollTo({top:0,behavior:"smooth"});return;}
    if(action==="meeting"){$("rail-meet")?.click();return;}
    if(action==="history"){$("rail-history")?.click();return;}
    if(action==="help"){$("rail-help")?.click();return;}
    const targets={secretaries:"secretary-profiles",scene:"meeting-room",tasks:"task-panel"};
    const node=$(targets[action]);
    if(!node)return;
    if(node.tagName==="DETAILS")node.open=true;
    node.scrollIntoView({behavior:"smooth",block:"start"});
  }
  document.querySelectorAll("[data-action]").forEach(button=>
    button.addEventListener("click",()=>run(button.dataset.action)));
  document.querySelectorAll("[data-persona]").forEach(button=>button.addEventListener("click",()=>{
    if(typeof window.showAgent==="function")window.showAgent(button.dataset.persona);
    else run("secretaries");
  }));
  const chair=$("quick-chair"),mode=$("quick-mode"),round=$("quick-rounds");
  function syncChair(){
    if(!chair)return;
    document.querySelectorAll("[data-chair]").forEach(n=>{
      const active=n.dataset.chair===chair.value;n.classList.toggle("active",active);n.setAttribute("aria-pressed",String(active));
    });
  }
  function syncMode(){
    if(!mode)return;
    document.querySelectorAll("[data-mode]").forEach(n=>{
      const active=n.dataset.mode===mode.value;n.classList.toggle("active",active);n.setAttribute("aria-pressed",String(active));
    });
  }
  function syncRound(){
    const value=Number(round?.value||2);
    if($("round-number"))$("round-number").textContent=String(value);
    document.querySelectorAll("[data-round-step]").forEach(n=>{
      n.disabled=(Number(n.dataset.roundStep)<0&&value===1)||(Number(n.dataset.roundStep)>0&&value===5);
    });
  }
  document.querySelectorAll("[data-chair]").forEach(n=>n.addEventListener("click",()=>{
    chair.value=n.dataset.chair;syncChair();
    const input=document.querySelector('#quick-attendees input[value="'+chair.value+'"]');
    if(input)input.checked=true;
  }));
  document.querySelectorAll("[data-mode]").forEach(n=>n.addEventListener("click",()=>{
    mode.value=n.dataset.mode;syncMode();
  }));
  document.querySelectorAll("[data-round-step]").forEach(n=>n.addEventListener("click",()=>{
    round.value=String(Math.max(1,Math.min(5,Number(round.value)+Number(n.dataset.roundStep))));
    syncRound();
  }));
  chair?.addEventListener("change",syncChair);
  mode?.addEventListener("change",syncMode);
  round?.addEventListener("change",syncRound);
  document.querySelectorAll("#quick-attendees input").forEach(n=>
    n.addEventListener("change",()=>{
      const chosen=[...document.querySelectorAll("#quick-attendees input:checked")].map(x=>x.value);
      if(!chosen.includes(chair.value)&&chosen.length){chair.value=chosen[0];syncChair();}
    }));
  syncChair();syncMode();syncRound();
  // Header/side-panel opening should remain keyboard accessible and use existing handlers.
})();