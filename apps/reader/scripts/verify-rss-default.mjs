import assert from 'node:assert/strict';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
function files(url){return readdirSync(url,{withFileTypes:true}).flatMap(entry=>{const child=new URL(entry.name+(entry.isDirectory()?'/':''),url);return entry.isDirectory()?files(child):[child];});}
const outputs=files(new URL('../.cloudflare/output/v0/',import.meta.url));
const tokens=['00000000-0000-4000-8000-000000000064','RSS_RAW_BODY_MUST_NOT_RENDER','RSS_QUOTE_MUST_NOT_RENDER','rss-special-book'];
assert(outputs.length>100&&outputs.every(path=>{const bytes=readFileSync(path);return tokens.every(token=>!bytes.includes(Buffer.from(token)));}));
const result={status:'passed',checks:['Default Worker/client/config exclude rss64 fixture identifiers and payloads'],filesScanned:outputs.length,finishedAt:new Date().toISOString()};
writeFileSync(new URL('../.cloudflare/evidence/rss/default-isolation.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify(result,null,2)+'\n');
