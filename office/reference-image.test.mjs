import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("reference pixel office artwork is a real same-origin WebP, not low-res mock or remote asset",()=>{
 const p=new URL("./assets/hva-meeting-room.webp",import.meta.url);
 assert.ok(fs.existsSync(p),"User-supplied image asset missing");
 const image=fs.readFileSync(p);
 assert.ok(image.byteLength>20_000,"Reference image was over-compressed");
 assert.equal(image.subarray(0,4).toString(),"RIFF");
 assert.equal(image.subarray(8,12).toString(),"WEBP");
 assert.equal(image.readUInt32LE(4)+8,image.byteLength);
});
