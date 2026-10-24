import test from "node:test";
import assert from "node:assert/strict";
import {chromium} from "playwright";

test("desktop RPG design and original demo meeting flow", {timeout:60000}, async()=>{
 const browser=await chromium.launch({headless:true});
 try{
   const page=await browser.newPage({viewport:{width:1680,height:980},deviceScaleFactor:1});
   const errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.goto("http://127.0.0.1:8768/office/",{waitUntil:"domcontentloaded"});
   await page.locator(".hero-stage").waitFor();
   assert.equal(await page.locator(".profile-card").count(),3);
   assert.equal(await page.locator(".preview-tile").count(),4);
   assert.equal(await page.locator(".hero-art").evaluate(e=>getComputedStyle(e).backgroundImage.includes("rpg-hero.webp")),true);
   const asset=await page.request.get("http://127.0.0.1:8768/office/assets/rpg-hero.webp");
   assert.equal(asset.status(),200);
   await page.screenshot({path:"rpg-desktop.png",fullPage:true});
   await page.locator('[data-chair="gemini"]').click();
   assert.equal(await page.locator("#quick-chair").inputValue(),"gemini");
   await page.locator('[data-mode="debate"]').click();
   assert.equal(await page.locator("#quick-mode").inputValue(),"debate");
   await page.locator('[data-mode="consensus"]').click();
   await page.locator('[data-round-step="1"]').click();
   assert.equal(await page.locator("#quick-rounds").inputValue(),"3");
   await page.locator('[data-round-step="-1"]').click();
   await page.locator('[data-round-step="-1"]').click();
   assert.equal(await page.locator("#quick-rounds").inputValue(),"1");
   await page.locator("#quick-attendees input").evaluateAll(inputs=>{
     for(const el of inputs)el.checked=["gemini","chatgpt"].includes(el.value);
   });
   await page.locator('[data-chair="chatgpt"]').click();
   await page.locator("#quick-meeting button.form-launch").click();
   await page.locator("#modal-title").getByText(/會議完成/).waitFor({timeout:35000});
   assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test("mobile layout keeps meetings and original room accessible", {timeout:30000}, async()=>{
 const browser=await chromium.launch({headless:true});
 try{
   const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.goto("http://127.0.0.1:8768/office/",{waitUntil:"domcontentloaded"});
   await page.locator("#quick-topic").waitFor();
   await page.screenshot({path:"rpg-mobile.png",fullPage:true});
   const widths=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:window.innerWidth}));
   assert.ok(widths.content<=widths.viewport+4,JSON.stringify(widths));
   await page.locator("#meeting-room summary").click();
   assert.equal(await page.locator("#meeting-room").getAttribute("open"),"");
   assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
