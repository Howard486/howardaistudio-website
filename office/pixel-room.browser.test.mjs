import test from "node:test";
import assert from "node:assert/strict";
import {chromium} from "playwright";

test("desktop: original layout + actual 2x pixel buffer + clickable meeting and demo", {timeout:60000},async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];page.on("pageerror",err=>errors.push(err.message));
    await page.goto("http://127.0.0.1:8768/office/",{waitUntil:"domcontentloaded"});
    await page.locator("#office-scene").waitFor();
    const state=await page.evaluate(()=>({buffer:scene._pixelBackground?.width,frame:scene._pixelFrame?.height}));
    if(!state.buffer)await page.waitForTimeout(300);
    const after=await page.evaluate(()=>({buffer:scene._pixelBackground?.width,frame:scene._pixelFrame?.height}));
    assert.equal(after.buffer,480);
    assert.equal(after.frame,304);
    assert.equal(await page.locator(".scene-shell").count(),1);
    assert.equal(await page.locator(".rpg-shell").count(),0);
    await page.screenshot({path:"pixel-meeting-desktop.png",fullPage:true});
    // Click scene at table center; preserve original hit-testing behavior.
    await page.locator("#office-scene").click({position:{x:575,y:301}});
    assert.equal(await page.locator("#modal-backdrop").getAttribute("class"),"modal-backdrop");
    await page.locator("#modal-close").click();
    await page.locator("#quick-rounds").selectOption("1");
    await page.locator("#quick-meeting #quick-attendees input").evaluateAll(inputs=>{
      for(const input of inputs)input.checked=["gemini","chatgpt"].includes(input.value);
    });
    await page.locator("#quick-meeting button.launch-button").click();
    await page.locator("#modal-title").getByText(/會議完成/).waitFor({timeout:35000});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
test("mobile: original controls and new canvas still fit screen", {timeout:30000},async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const errors=[];page.on("pageerror",err=>errors.push(err.message));
    await page.goto("http://127.0.0.1:8768/office/",{waitUntil:"domcontentloaded"});
    await page.locator("#office-scene").waitFor();
    await page.screenshot({path:"pixel-meeting-mobile.png",fullPage:true});
    const view=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,win:innerWidth}));
    assert.ok(view.doc<=view.win+4,JSON.stringify(view));
    assert.equal(await page.locator("#quick-meeting").count(),1);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
