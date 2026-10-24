/* HowardAI Studio - pixel meeting room visual only.
   Draws the existing room to a reusable half-resolution buffer, then scales it
   2x with smoothing disabled. All original Office/Agent/meeting logic stays in app.js.
*/
(function(){
  "use strict";
  if(typeof OfficeScene==="undefined")return;
  const W=960,H=608,S=2;
  const ink="#171c35",ivory="#ffe6cb",hairDark="#372c50";
  function rect(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function poly(c,points,col,edge){
    c.beginPath();c.moveTo(Math.round(points[0][0]),Math.round(points[0][1]));
    for(let i=1;i<points.length;i++)c.lineTo(Math.round(points[i][0]),Math.round(points[i][1]));
    c.closePath();c.fillStyle=col;c.fill();
    if(edge){c.strokeStyle=edge;c.lineWidth=2;c.stroke();}
  }
  function oval(c,x,y,rx,ry,col,edge){
    c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=col;c.fill();
    if(edge){c.strokeStyle=edge;c.lineWidth=3;c.stroke();}
  }
  function star(c,x,y,col){rect(c,x-3,y,10,3,col);rect(c,x,y-4,3,12,col);}
  function windowArt(c,x){
    rect(c,x,31,119,112,"#63516e");
    rect(c,x+6,37,107,99,"#1b2c55");
    rect(c,x+7,91,105,43,"#38365e");
    for(let i=0;i<12;i++){
      const xx=x+12+(i*29)%92, yy=44+(i*17)%76;
      rect(c,xx,yy,3,3,i%3===0?"#f9c7cf":"#c4b4ef");
    }
    rect(c,x+55,35,6,102,"#ccb4b9");rect(c,x+8,76,106,6,"#ccb4b9");
    rect(c,x-4,24,126,10,"#594766");rect(c,x-2,134,122,9,"#684f6c");
  }
  function plant(c,x,y){
    rect(c,x-12,y,26,22,"#9c6980");
    rect(c,x-16,y,33,6,"#db9c91");
    for(const [dx,dy] of [[-20,-27],[-8,-43],[9,-34],[15,-18]]){
      rect(c,x+dx,y+dy,16,21,dy%2?"#61a48a":"#487e76");
      rect(c,x+dx+4,y+dy+4,8,9,"#89bd96");
    }
  }
  function desk(c,iso,x,y,label){
    const q=iso(x,y,0),xx=q[0],yy=q[1];
    oval(c,xx,yy+15,62,18,"#362b46");
    poly(c,[[xx-61,yy],[xx-10,yy-33],[xx+70,yy+7],[xx+19,yy+39]],"#76516b","#503c57");
    poly(c,[[xx-61,yy-5],[xx-10,yy-37],[xx+70,yy-1],[xx+19,yy+33]],"#bc8d7b","#e2a990");
    rect(c,xx-26,yy-50,48,33,ink);rect(c,xx-22,yy-47,40,24,"#467c9e");
    rect(c,xx-18,yy-44,32,17,"#8ac0d1");rect(c,xx-2,yy-18,7,8,ink);
    rect(c,xx+31,yy-13,17,11,ivory);
    c.fillStyle="#fbe0df";c.font="bold 12px monospace";c.fillText(label,xx-34,yy-55);
  }
  function paintStatic(room,bg){
    const c=bg.getContext("2d",{alpha:false}),iso=(x,y,z)=>room.iso(x,y,z);
    c.setTransform(.5,0,0,.5,0,0);
    rect(c,0,0,W,H,"#172441");
    for(let y=0;y<160;y+=32)rect(c,0,y,W,32,["#141b37","#1a2242","#222d50","#273353","#2f3556"][y/32]);
    for(const x of [117,327,552,769])windowArt(c,x);
    oval(c,625,65,15,15,"#ffe7bc");oval(c,634,59,12,13,"#1b2951");
    for(let i=0;i<26;i++){
      const x=(i*79+41)%950,y=(i*19+21)%105;
      rect(c,x,y,i%4===0?4:2,i%4===0?4:2,i%3===0?"#e8b4de":"#b4a4df");
    }
    rect(c,0,144,960,9,"#d4a081");rect(c,0,153,960,13,"#644d71");
    // Lanterns and warm interior highlights.
    for(const x of [79,744]){
      rect(c,x,102,6,34,"#92748e");rect(c,x-11,129,29,23,"#6f4b67");
      rect(c,x-6,132,19,15,"#ffd39b");rect(c,x,136,7,6,"#fff0c4");
      star(c,x+34,103,"#ffc2ec");
    }
    // Original isometric projection and hit targets are deliberately unchanged.
    poly(c,[iso(0,0),iso(30,0),iso(30,19),iso(0,19)],"#714f68","#4c3c5b");
    const tiles=["#956b77","#866276","#a0757a","#77546b"];
    for(let y=0;y<19;y++)for(let x=0;x<30;x++){
      poly(c,[iso(x,y),iso(x+1,y),iso(x+1,y+1),iso(x,y+1)],
           tiles[(x+2*y)%4],"#63495f");
    }
    const q=iso(15,8.7),mx=q[0],my=q[1];
    // Ornate pixel carpet below the table.
    oval(c,mx,my+40,207,104,"#402d56","#c08c9b");
    oval(c,mx,my+39,191,93,"#5e496d","#e8b9a6");
    oval(c,mx,my+39,174,78,"#335667","#a4d3c7");
    for(let i=0;i<18;i++){
      const a=i*Math.PI/9;
      rect(c,mx+Math.cos(a)*182-3,my+39+Math.sin(a)*86-3,6,6,"#f5c492");
    }
    for(const item of [[4,5,"GE / TECH"],[5,11,"OPS"],[23,5,"TIA / AI"],[23,12,"PE / INTEL"]]){
      desk(c,iso,item[0],item[1],item[2]);
    }
    const books=iso(2,15,28);
    rect(c,books[0]-37,books[1]-83,92,84,"#5a435b");
    rect(c,books[0]-31,books[1]-78,80,73,"#c89988");
    for(let k=0;k<3;k++)for(let j=0;j<7;j++){
      rect(c,books[0]-24+j*10,books[1]-75+k*25,8,18,
        ["#539c9b","#6b75af","#cf9c91","#8f68a0"][(j+k)%4]);
    }
    const coff=iso(25,14,22);
    rect(c,coff[0]-19,coff[1]-36,45,37,"#54405e");
    rect(c,coff[0]-12,coff[1]-31,30,19,"#78acba");
    rect(c,coff[0]-7,coff[1]-25,20,7,"#c5ebde");
    for(const item of [[3,3],[27,3],[5,14],[27,17]]){const p=iso(item[0],item[1]);plant(c,p[0],p[1]-9);}
    // Board with mini sticky notes.
    rect(c,407,105,172,56,"#876b83");rect(c,415,109,156,43,"#f8e5d0");
    rect(c,426,115,53,7,"#70b9b5");rect(c,426,127,82,5,"#c4a9ab");
    rect(c,524,113,24,23,"#efb89a");rect(c,554,115,12,18,"#c5a9dc");
    // Oval table; papers, cups, crystal.
    oval(c,mx,my+22,175,80,"#4b3249","#32243e");
    oval(c,mx,my+12,167,74,"#835967","#e0a886");
    oval(c,mx,my+3,157,65,"#b98074","#e7b69e");
    oval(c,mx,my-4,147,54,"#d8a08a");
    for(const p of [[-77,-28],[-30,29],[41,-17],[76,24]]){
      rect(c,mx+p[0],my+p[1],28,19,ivory);
      rect(c,mx+p[0]+5,my+p[1]+6,17,3,"#cbb9c7");
    }
    rect(c,mx-23,my-22,39,13,"#42607e");rect(c,mx-20,my-20,33,5,"#8accc0");
    for(const p of [[-124,-22],[120,-27],[-113,62],[115,59]]){
      oval(c,mx+p[0],my+p[1],17,10,"#483754");
      rect(c,mx+p[0]-13,my+p[1]-13,26,9,"#886487");
    }
    // Branding inside the scene instead of changing the site header.
    rect(c,24,20,211,49,"#151d36");
    rect(c,24,20,211,4,"#9f80a9");
    c.fillStyle="#ffe0d4";c.font="bold 18px monospace";c.fillText("HOWARD AI STUDIO",38,45);
    c.fillStyle="#b9a7d9";c.font="12px monospace";c.fillText("PIXEL MEETING ROOM",38,62);
    return [mx,my];
  }
  const profiles={
    gemini:["#805c76","#b88e94","#406b9b","#b9dbff","Ge",true,false],
    chatgpt:["#302943","#655478","#63497e","#e3b5f3","Tia",false,true],
    perplexity:["#ac7e67","#dfb499","#985e7f","#ffddc8","Pe",false,false],
    claude:["#a67c67","#d9b19b","#b48269","#fbe1c4","Claude",false,false],
    copilot:["#695987","#9f85b7","#6263a1","#c5cdff","Copilot",false,false],
    boss:["#324258","#73879c","#398b96","#a7e9e4","Boss (You)",false,false]
  };
  function sprite(c,scene,a,id,t){
    const q=scene.iso(a.x,a.y),x=Math.round(q[0]),y=Math.round(q[1]+(a.path?.length?Math.sin(t*.014)*3:0));
    const p=profiles[id]||profiles.boss;
    oval(c,x,y+7,22,7,"#392f4e");
    rect(c,x-13,y-7,10,16,"#28243a");rect(c,x+5,y-7,10,16,"#28243a");
    rect(c,x-16,y-34,33,30,p[2]);rect(c,x-19,y-29,6,20,p[3]);rect(c,x+14,y-29,6,20,p[3]);
    rect(c,x-7,y-34,15,10,p[3]);
    rect(c,x-20,y-68,40,41,p[0]);rect(c,x-15,y-62,31,32,"#f2c9ac");
    rect(c,x-20,y-68,40,15,p[0]);rect(c,x-20,y-53,7,24,p[0]);rect(c,x+14,y-53,7,24,p[0]);
    rect(c,x-17,y-66,27,6,p[1]);
    rect(c,x-11,y-49,7,7,"#ffede4");rect(c,x+5,y-49,7,7,"#ffede4");
    rect(c,x-9,y-47,4,5,"#332a48");rect(c,x+7,y-47,4,5,"#332a48");
    rect(c,x-1,y-37,4,2,"#b97986");
    if(p[5]){c.strokeStyle="#293249";c.lineWidth=3;c.strokeRect(x-15,y-51,14,12);c.strokeRect(x+2,y-51,14,12);rect(c,x-1,y-49,4,3,"#293249");}
    if(p[6]){rect(c,x+16,y-75,10,12,"#dcb5e5");rect(c,x+25,y-69,7,5,"#ad84cb");}
    c.font="bold 13px monospace";
    const tw=Math.round(c.measureText(p[4]).width)+18;
    rect(c,x-tw/2,y-92,tw,19,ink);rect(c,x-tw/2,y-92,tw,3,id==="boss"?"#94dfd0":"#dea5ce");
    c.fillStyle=ivory;c.fillText(p[4],x-tw/2+9,y-77);
    if(a.bubble&&Date.now()<a.bubbleUntil){
      const str=a.bubble.slice(0,16),w=Math.min(220,Math.max(86,str.length*13+18));
      const xx=Math.max(4,Math.min(W-w-4,x-w/2));
      rect(c,xx,y-131,w,31,"#fff0e1");rect(c,xx+18,y-101,12,7,"#fff0e1");
      c.fillStyle="#3b3148";c.font="12px sans-serif";c.fillText(str,xx+8,y-111);
    }
  }
  OfficeScene.prototype.draw=function(time){
    if(!this._pixelBackground){
      const bg=document.createElement("canvas");bg.width=W/S;bg.height=H/S;
      this._pixelCenter=paintStatic(this,bg);this._pixelBackground=bg;
    }
    if(!this._pixelFrame){
      const frame=document.createElement("canvas");frame.width=W/S;frame.height=H/S;
      this._pixelFrame=frame;
    }
    const c=this._pixelFrame.getContext("2d",{alpha:false});
    c.setTransform(1,0,0,1,0,0);c.drawImage(this._pixelBackground,0,0);
    c.setTransform(.5,0,0,.5,0,0);
    const x=this._pixelCenter[0],y=this._pixelCenter[1];
    if(this.meeting){
      oval(c,x,y+18,174,80,"#00000000","#fce1b5");
      star(c,x-184,y-40,"#ffcbdc");star(c,x+173,y-29,"#ffd4a0");
    }
    const people=[this.player,...this.agents.filter(a=>a.state!=="OFFLINE")].sort((a,b)=>a.x+a.y-b.x-b.y);
    for(const person of people)sprite(c,this,person,person===this.player?"boss":person.id,time);
    rect(c,337,545,295,40,"#18213c");rect(c,337,545,295,4,"#a384ac");
    c.font="bold 15px sans-serif";c.fillStyle="#ffe3b4";
    c.fillText(this.meeting?"✦ 會議進行中 · 討論與協作":"✦ 點選圓桌召開多模型會議",351,572);
    this.ctx.setTransform(1,0,0,1,0,0);
    this.ctx.imageSmoothingEnabled=false;
    this.ctx.drawImage(this._pixelFrame,0,0,W,H);
  };
})();