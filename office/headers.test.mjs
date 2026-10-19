import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const h=readFileSync(new URL('../_headers',import.meta.url),'utf8');
const rules=h.trim().split(/\n\s*\n/).map(s=>({path:s.split('\n')[0].trim(),headers:s}));
test('global wildcard must not restrict Office loopback',()=>{const r=rules.find(x=>x.path==='/*');assert.ok(r);assert.doesNotMatch(r.headers,/^\s+Content-Security-Policy:/m);});
test('Office CSP allows HTTP and WS loopback',()=>{const r=rules.find(x=>x.path==='/office/*');assert.ok(r);assert.match(r.headers,/connect-src[^\n]*http:\/\/127\.0\.0\.1:8765[^\n]*ws:\/\/127\.0\.0\.1:8765/);});
test('all root HTML retain restrictive CSP',()=>{for(const route of ["/","/index.html","/pricing.html","/privacy.html","/refund.html","/terms.html"]){const r=rules.find(x=>x.path===route);assert.ok(r,route);assert.match(r.headers,/^\s+Content-Security-Policy:/m);}});
