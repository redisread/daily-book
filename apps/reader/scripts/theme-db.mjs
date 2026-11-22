import {execFileSync} from 'node:child_process';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
const root=fileURLToPath(new URL('../',import.meta.url));
const common=['00000000-0000-4000-8000-000000000058','--local','--mode','reader-theme-test','--persist-to','.cloudflare/theme-state'];
const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('CLOUDFLARE_')));
export function migrateThemeDB(){execFileSync(`${root}node_modules/.bin/cf`,['d1','migrations','apply',...common,'--dir','migrations'],{cwd:root,env,stdio:['ignore','pipe','pipe']});}
export function themeSQL(sql){return JSON.parse(execFileSync(`${root}node_modules/.bin/cf`,['d1','raw',...common,`--sql=${sql}`],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024}));}
