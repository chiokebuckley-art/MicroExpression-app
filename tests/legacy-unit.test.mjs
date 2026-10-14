// Execute the existing browser-independent unit suite with a DOM and IndexedDB shim.
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(process.env.MICRO_TEST_DEPS || new URL('../../test-deps/package.json',import.meta.url));
const {JSDOM}=require('jsdom'); const {indexedDB}=require('fake-indexeddb');
const html=fs.readFileSync(new URL('./unit.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://example.test/tests/unit.html'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,indexedDB});
globalThis.fetch=async path=>({json:async()=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),'utf8'))});
let source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
source=source.replace(/from '(\.\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,import.meta.url).href}'`).replace('runAll().catch','await runAll().catch');
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
console.log(document.querySelector('#testSummary').textContent);if(!window.__unitTestsPassed)process.exitCode=1;
