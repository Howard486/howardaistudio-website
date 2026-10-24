/* HVA Office picture-first scene: owner-provided pixel art as the primary room UI.
   All SaaS meeting and Agent operations remain in unchanged app.js.
   No external CDN, tracking, API calls, credentials or third-party automation.
*/
(()=>{
 "use strict";
 if(typeof OfficeScene==="undefined")return;
 const W=960,H=608;
 const source="/office/assets/hva-meeting-room.webp";
 const img=new Image();
 img.decoding="async";
 let ready=false,failed=false;
 img.onload=()=>{ready=true;};
 img.onerror=()=>{failed=true;};
 img.src=source;
 // The original scene is a safe fallback if the static asset cannot be loaded.
 const oldDraw=OfficeScene.prototype.draw;
 const oldClick=OfficeScene.prototype.click;
 const position=(event,canvas)=>{
   const rect=canvas.getBoundingClientRect();
   return {
     x:(event.clientX-rect.left)*W/rect.width,
     y:(event.clientY-rect.top)*H/rect.height
   };
 };
 const imageRect=()=>{
   // Contain the complete 16:9 reference in the existing 960x608 canvas.
   const aspect=1672/941;
   const width=Math.min(W,H*aspect);
   const height=width/aspect;
   return {x:(W-width)/2,y:(H-height)/2,width,height};
 };
 const scaleImageToCanvas=(sx,sy)=>{
   const a=imageRect();
   return [a.x+a.width*sx/1672,a.y+a.height*sy/941];
 };
 OfficeScene.prototype.click=function(e){
   if(!ready)return oldClick.call(this,e);
   const p=position(e,this.canvas);
   const coords=[
     {id:"gemini",loc:[655,517],rx:145,ry:175},
     {id:"perplexity",loc:[875,515],rx:130,ry:175},
     {id:"chatgpt",loc:[1082,517],rx:140,ry:175}
   ];
   for(const a of coords){
     const [x,y]=scaleImageToCanvas(...a.loc);
     const r=imageRect();
     const dx=(p.x-x)/(a.rx*r.width/1672),dy=(p.y-y)/(a.ry*r.height/941);
     if(dx*dx+dy*dy<1 && p.y<scaleImageToCanvas(0,625)[1]){
       this.onAgentClick(a.id);return;
     }
   }
   // Interactive round table shown by the reference drawing.
   const [tx,ty]=scaleImageToCanvas(865,734);
   const r=imageRect();
   const dx=(p.x-tx)/(515*r.width/1672);
   const dy=(p.y-ty)/(185*r.height/941);
   if(dx*dx+dy*dy<1){this.onMeetingClick();return;}
   // Outside the artwork hotspots there is no walkable path on a static picture.
 };
 OfficeScene.prototype.draw=function(t){
   if(!ready){oldDraw.call(this,t);return;}
   const c=this.ctx,area=imageRect();
   c.setTransform(1,0,0,1,0,0);
   c.imageSmoothingEnabled=true;
   c.fillStyle="#101832";c.fillRect(0,0,W,H);
   c.drawImage(img,area.x,area.y,area.width,area.height);
   // Thin interactive indicator; the supplied image remains fully visible.
   if(this.meeting){
     c.save();c.strokeStyle="rgba(255,222,169,.95)";c.lineWidth=4;
     const [x,y]=scaleImageToCanvas(870,748),r=imageRect();
     c.beginPath();c.ellipse(x,y,491*r.width/1672,168*r.height/941,0,0,2*Math.PI);
     c.stroke();c.restore();
   }
   c.font="bold 13px sans-serif";
   const label=this.meeting?"✦ 會議進行中":"✦ 點選圓桌開始會議";
   const tw=c.measureText(label).width+28;
   c.fillStyle="rgba(9,18,39,.83)";c.fillRect((W-tw)/2,H-35,tw,27);
   c.fillStyle="#ffe5c5";c.fillText(label,(W-tw)/2+14,H-16);
 };
})();
