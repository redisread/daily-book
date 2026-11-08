import assert from 'node:assert/strict';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../.cloudflare/output/v0/',import.meta.url);
function files(url){return readdirSync(url,{withFileTypes:true}).flatMap(entry=>{const child=new URL(entry.name+(entry.isDirectory()?'/':''),url);return entry.isDirectory()?files(child):[child];});}
const config=JSON.parse(readFileSync(new URL('config.json',root),'utf8'));const worker=JSON.parse(readFileSync(new URL('workers/default/worker.config.json',root),'utf8'));
// Existing default-build assertions remain preconditions, not counted again.
assert.equal(config.buildContext.mode,'production');assert.equal(worker.name,'daily-book-reader-local');assert.equal(worker.env.DB.id,'00000000-0000-4000-8000-000000000049');assert.equal(worker.env.DB.dev.remote,false);
const outputs=files(root);assert(outputs.length>100);const checks=[];const check=(name,value)=>{assert(value,name);checks.push(name);};
const markers=['00000000-0000-4000-8000-000000000070','00000000-0000-4000-8000-000000000071','reader-issue-test','daily-book-reader-issue-local','admin_write_test_barrier','Local write-test barrier timed out','00000000-0000-4000-8000-000000000053','00000000-0000-4000-8000-000000000054','_local_history_receipt','00000000-0000-4000-8000-000000000057','00000000-0000-4000-8000-000000000058','00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000063','00000000-0000-4000-8000-000000000064','reader_test_barrier','Local race-test barrier timed out','theme-reference','archive-extra-','search-title-book','rss-special-book','DRAFT_ONLY_BOOK_TITLE_SENTINEL','DRAFT_ONLY_BOOK_DESCRIPTION_SENTINEL','WITHDRAWN_ONLY_BOOK_TITLE_SENTINEL','DRAFT_BODY_SENTINEL','DRAFT_SHARED_BODY_SENTINEL','WITHDRAWN_BODY_SENTINEL','PUBLISHED_BODY_STORED_NOT_RENDERED','EXTRA_PUBLISHED_BODY_NOT_RENDERED','ARCHIVE_BODY_MUST_NOT_RENDER','SEARCH_BODY_MUST_NOT_RENDER','SEARCH_QUOTE_MUST_NOT_SEARCH','RSS_RAW_BODY_MUST_NOT_RENDER','RSS_QUOTE_MUST_NOT_RENDER','RSS_EDITOR_NOTE_MUST_NOT_RENDER'];
check('Normal Worker/client/config exclude all runtime test assemblies, isolated import receipt and data markers',outputs.every(path=>{const bytes=readFileSync(path);return markers.every(marker=>!bytes.includes(Buffer.from(marker)));}));
const literal=/CONTENT_API_KEY["']?\s*[:=]\s*["'][^"']+["']/;
check('Normal key binding remains a valueless secret declaration, not an embedded literal',JSON.stringify(worker.env.CONTENT_API_KEY)==='{"type":"secret"}'&&outputs.filter(path=>/\.(?:js|json|html|css|map)$/.test(path.pathname)).every(path=>!literal.test(readFileSync(path,'utf8'))));
const result={status:'passed',checks,filesScanned:outputs.length,fixtureMarkersScanned:markers.length,finishedAt:new Date().toISOString()};writeFileSync(new URL('../.cloudflare/evidence/integrated-default.json',import.meta.url),JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result,null,2)+'\n');
