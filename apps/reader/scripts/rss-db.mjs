import {execFileSync} from 'node:child_process';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
const root=fileURLToPath(new URL('../',import.meta.url));
const common=['00000000-0000-4000-8000-000000000064','--local','--mode','reader-rss-test','--persist-to','.cloudflare/rss-state'];
const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));
export function migrateRssDB(){execFileSync(`${root}node_modules/.bin/cf`,['d1','migrations','apply',...common,'--dir','migrations'],{cwd:root,env,stdio:['ignore','pipe','pipe']});}
export function rssSQL(sql){return JSON.parse(execFileSync(`${root}node_modules/.bin/cf`,['d1','raw',...common,`--sql=${sql}`],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024}));}
export function rssRows(sql){return rssSQL(sql).flatMap(result=>result.results.rows.map(values=>Object.fromEntries(result.results.columns.map((key,index)=>[key,values[index]]))));}
