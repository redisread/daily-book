/* global document, innerWidth, getComputedStyle, HTMLElement, window */
import assert from 'node:assert/strict';
import process from 'node:process';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
import {chromium,expect} from '@playwright/test';
import {migrateThemeDB,themeSQL} from './theme-db.mjs';

const mode=process.argv[2];assert(['dev','built'].includes(mode));
const root=fileURLToPath(new URL('../',import.meta.url));const output=new URL('../.cloudflare/evidence/theme/',import.meta.url);mkdirSync(output,{recursive:true});
const origin=`http://127.0.0.1:${mode==='dev'?49658:49659}`;const baselineOrigin='http://127.0.0.1:49680';const baseline=process.env.BOOK_THEME_BASELINE;
const result={mode,startedAt:new Date().toISOString(),checks:[],screenshots:[],baselineComparison:baseline?'fixed8b actual browser':'not-run; set BOOK_THEME_BASELINE for original comparison'};const children=[];let browser;const logs=[];
const check=(label,value)=>{assert(value,label);result.checks.push(label);};
const reference=JSON.parse(readFileSync(new URL('../fixtures/theme-reference-provenance.json',import.meta.url),'utf8'));
const seed=readFileSync(new URL('../fixtures/theme-reference.sql',import.meta.url),'utf8');
const styleHash=createHash('sha256').update(readFileSync(new URL('../app/original-theme.css',import.meta.url))).digest('hex');result.originalCSSSHA256=styleHash;
async function start(cwd,args,url){const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('CLOUDFLARE_')));const child=spawn(process.execPath,args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});children.push(child);let text='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{text+=chunk;logs.push(chunk.toString());});const deadline=Date.now()+90000;while(!text.includes(url)){if(child.exitCode!==null)throw new Error('Owned theme server exited');if(Date.now()>deadline)throw new Error('Owned theme server startup timed out');await wait(100);}return child;}
async function fonts(page){const loaded=await page.evaluate(async()=>{await document.fonts.ready;const groups=await Promise.all(['700 16px "Space Grotesk"','400 16px "Inter"','500 16px "Inter"','500 16px "JetBrains Mono"','700 16px "JetBrains Mono"'].map(value=>document.fonts.load(value,'Reader 129')));return groups.map(faces=>faces.length>0&&faces.every(face=>face.status==='loaded'));});assert(loaded.every(Boolean),'All five original self-hosted font faces must really load');}
async function shot(page,name,fullPage=true){await page.screenshot({path:fileURLToPath(new URL(name,output)),fullPage,animations:'disabled'});result.screenshots.push(name);}
async function noOverflow(page,label){const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));check(`${label}: no document horizontal overflow`,dimensions.document<=dimensions.viewport+1);}
async function textReflow(page,label){
  const clips=await page.locator('.book-title,.book-desc,.editor-note-text,.cover-title,.cover-author,.quote-text,.quote-source,.book-meta-inline').evaluateAll(nodes=>nodes.filter(node=>{
    if(!node.checkVisibility()||!node.clientWidth)return false;
    if(node.scrollWidth>node.clientWidth+2)return true;
    // CJK glyph ink may extend a few px beyond a tight, overflow-visible line
    // box. That is not truncation: check actual clipping ancestors instead.
    const range=document.createRange();range.selectNodeContents(node);const ink=range.getBoundingClientRect();
    for(let parent=node;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(['hidden','clip'].includes(style.overflowY)){const box=parent.getBoundingClientRect();if(ink.top<box.top-2||ink.bottom>box.bottom+2)return true;}}
    return false;
  }).map(node=>({class:node.className,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight})));
  if(clips.length)result.clips=clips;check(`${label}: visible full text is not clipped`,clips.length===0);
}
async function doubleText(page){await page.evaluate(()=>{const nodes=[...document.querySelectorAll('body,body *')].filter(node=>node instanceof HTMLElement&&!['SCRIPT','STYLE'].includes(node.tagName));const sizes=nodes.map(node=>parseFloat(getComputedStyle(node).fontSize));nodes.forEach((node,index)=>{node.style.fontSize=(sizes[index]*2)+'px';});document.documentElement.dataset.textScale='200';});}
async function styles(page){return page.evaluate(()=>{const value=selector=>getComputedStyle(document.querySelector(selector));const cover=document.querySelector('.book-cover').getBoundingClientRect();return{bg:value('body').backgroundColor,fg:value('body').color,font:value('body').fontFamily,titleFont:value('.book-title').fontFamily,titleSize:value('.book-title').fontSize,heroBorder:value('.hero-card').borderTopColor,accent:value('.date-main').color,coverWidth:cover.width,coverHeight:cover.height};});}
try{
  migrateThemeDB();themeSQL(seed);
  const child=await start(root,['node_modules/vite/bin/vite.js',mode==='dev'?'dev':'preview','--mode','reader-theme-test','--host','127.0.0.1','--port',mode==='dev'?'49658':'49659'],origin);
  if(baseline){const head=execFileSync('git',['rev-parse','HEAD'],{cwd:baseline,encoding:'utf8'}).trim();assert.equal(head,'8b991098f984a5f8870bd01741e3cb937b63d50d');execFileSync('git',['diff','--exit-code','--','src','public'],{cwd:baseline,stdio:'pipe'});const source=execFileSync('git',['show',head+':public/styles/neo-brutalism.css'],{cwd:baseline});check('Design-system CSS is byte-identical to fixed8b source',createHash('sha256').update(source).digest('hex')===styleHash);await start(baseline,['node_modules/astro/bin/astro.mjs','dev','--host','127.0.0.1','--port','49680'],baselineOrigin);}
  browser=await chromium.launch({channel:'chrome',headless:true});result.browserVersion=browser.version();
  const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(origin);check('Home actual200/no-store',response.status()===200&&(response.headers()['cache-control']??'').includes('no-store'));await fonts(page);check('Five original self-hosted font faces load successfully',true);await expect(page.getByRole('button',{name:/放大/})).toBeEnabled();
  const native=execFileSync('ps',['-axo','pid=,ppid=,pgid=,command='],{encoding:'utf8'}).split('\n').map(line=>/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)).filter(m=>m&&Number(m[3])===child.pid&&m[4].includes('/workerd')&&/\bserve\b/.test(m[4])).map(m=>({pid:Number(m[1]),group:Number(m[3]),command:m[4]}));check('UI is served by an owned native workerd',native.length>0);result.runtimeProcesses=native;
  check('Reference book/date/issue identity is displayed',(await page.locator('.book-title').innerText())===reference.displayedBook.title&&(await page.locator('.date-issue').innerText())==='第 129 期'&&(await page.locator('time').getAttribute('datetime'))===reference.publicationDate);
  check('Every reference quote is rendered in stable order',JSON.stringify(await page.locator('[data-quote-id] .quote-text').allTextContents())===JSON.stringify(reference.quotes.map(q=>q.text)));
  check('Raw stored body is not serialized into HTML/RSC markup',!(await page.content()).includes('BODY_NOT_FOR_SSR_THEME'));
  const hrefs=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));check('No archive/search/RSS/my/admin or placeholder link is exposed',hrefs.every(href=>href==='/'||href==='#main-content'||href==='/issues/theme-reference'));
  for(const width of [1280,375]){
    await page.setViewportSize({width,height:900});await fonts(page);await noOverflow(page,`Reference ${width}`);await textReflow(page,`Reference ${width}`);await shot(page,`${mode}-new-home-${width}.png`);
    const current=await styles(page);
    if(baseline){const old=await context.newPage();await old.setViewportSize({width,height:900});await old.goto(baselineOrigin);await old.addStyleTag({content:'astro-dev-toolbar{display:none !important}'});await fonts(old);await shot(old,`${mode}-baseline-home-${width}.png`);const original=await styles(old);(result.styleComparison??=[]).push({width,original,current});check(`Original palette/fonts/title-size/border/cover dimensions match at${width}`,JSON.stringify(current)===JSON.stringify(original));await old.close();}
  }
  await page.setViewportSize({width:1280,height:900});await page.keyboard.press('Tab');await expect(page.locator('.skip-link')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#main-content')).toBeFocused();check('Skip link moves keyboard focus to main',true);
  await page.getByRole('link',{name:'阅读第 129 期详情'}).click();await expect(page).toHaveURL(origin+'/issues/theme-reference');check('Home issue permalink navigates to implemented detail',true);await expect(page.getByRole('heading',{level:1})).toHaveText(reference.displayedBook.title);for(const width of [1280,375]){await page.setViewportSize({width,height:900});await fonts(page);await noOverflow(page,`Detail ${width}`);await shot(page,`${mode}-new-detail-${width}.png`);if(baseline){const old=await context.newPage();await old.setViewportSize({width,height:900});await old.goto(baselineOrigin+'/book/'+reference.publicationDate);await old.addStyleTag({content:'astro-dev-toolbar{display:none !important}'});await fonts(old);await shot(old,`${mode}-baseline-detail-${width}.png`);await old.close();}}
  await page.setViewportSize({width:1280,height:900});
  await expect(page.getByRole('button',{name:/放大/})).toBeEnabled();const trigger=page.getByRole('button',{name:/放大/});await trigger.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();check('Cover opens as a native accessible dialog from keyboard',true);
  for(let i=0;i<4;i++){await page.keyboard.press('Tab');check(`Dialog focus is contained ${i+1}`,await page.evaluate(()=>document.activeElement?.closest('dialog[open]')!==null));}
  for(let i=0;i<2;i++){await page.keyboard.press('Shift+Tab');check(`Dialog reverse focus is contained ${i+1}`,await page.evaluate(()=>Boolean(document.activeElement?.closest('dialog[open]'))));}
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(trigger).toBeFocused();check('Escape closes dialog and returns focus to its trigger',true);
  await page.getByRole('link',{name:'回到最新推荐'}).click();await expect(page).toHaveURL(origin+'/');check('Detail return link resolves to latest home',true);
  themeSQL(readFileSync(new URL('../fixtures/theme-stress.sql',import.meta.url),'utf8'));
  await page.goto(origin);await fonts(page);check('Home selects latest published date rather than largest issue number',(await page.locator('article').getAttribute('data-issue-id'))==='theme-long');
  for(const width of [1280,375,320]){
    await page.setViewportSize({width,height:900});await page.goto(origin+'/issues/theme-long');await fonts(page);await expect(page.getByRole('button',{name:/放大/})).toBeEnabled();await noOverflow(page,`Long ${width}`);await textReflow(page,`Long ${width}`);check(`All12 quotes exist in DOM at${width}`,await page.locator('[data-quote-id]').count()===12);check(`Missing note and numeric metadata are not invented at${width}`,await page.locator('.editor-note,.book-meta-inline').count()===0);check('Script-looking description remains inert',await page.evaluate(()=>window.__themeXSS===undefined));
    if(width===375){await page.locator('.quote-reader').focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('status')).toHaveText('第 2 / 12 条');check('Narrow quote reader supports ArrowRight',true);await page.getByRole('button',{name:'下一条书摘'}).click();await expect(page.getByRole('status')).toHaveText('第 3 / 12 条');check('Next control reveals the next full quote',true);await page.locator('.quote-reader').focus();await page.keyboard.press('End');await expect(page.getByRole('status')).toHaveText('第 12 / 12 条');await expect(page.getByRole('button',{name:'下一条书摘'})).toBeDisabled();check('End reaches last quote with truthful disabled boundary',true);await page.keyboard.press('Home');await expect(page.getByRole('status')).toHaveText('第 1 / 12 条');check('Home returns to first quote',true);}
    await shot(page,`${mode}-long-${width}.png`,false);
    await doubleText(page);await noOverflow(page,`200% text ${width}`);await textReflow(page,`200% text ${width}`);await shot(page,`${mode}-text200-${width}.png`,width===375);
    if(width===375){await page.getByRole('button',{name:/放大/}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await noOverflow(page,'Dialog200% text375');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:/放大/})).toBeFocused();check('Zoomed cover remains keyboard-operable and restores focus',true);}
  }
  const touchContext=await browser.newContext({viewport:{width:375,height:812},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'});const touchPage=await touchContext.newPage();
  await touchPage.goto(origin+'/issues/theme-long');await expect(touchPage.getByRole('button',{name:'下一条书摘'})).toBeEnabled();await touchPage.locator('.quote-reader').scrollIntoViewIfNeeded();
  const box=await touchPage.locator('.quote-reader').boundingBox();const session=await touchContext.newCDPSession(touchPage);const y=Math.max(30,Math.min(740,box.y+100));
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.8,y}]});
  for(let step=1;step<=8;step++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*(.8-.65*step/8),y}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>touchPage.locator('.quote-reader').evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);check('Actual Chrome touch events swipe the native quote track',true);await noOverflow(touchPage,'Touch375');await touchContext.close();
  if(mode==='built'){const noJS=await browser.newContext({viewport:{width:375,height:812},javaScriptEnabled:false});const staticPage=await noJS.newPage();const response=await staticPage.goto(origin+'/issues/theme-reference');check('Built SSR remains readable with JavaScript disabled',response.status()===200&&await staticPage.locator('[data-quote-id]').count()===reference.quotes.length&&(await staticPage.evaluate(()=>getComputedStyle(document.body).backgroundColor))==='rgb(242, 240, 234)'&&!(await staticPage.content()).includes('BODY_NOT_FOR_SSR_THEME'));await noJS.close();}
  await page.goto(origin+'/issues/theme-missing');await fonts(page);check('Single quote shows no false carousel controls',await page.locator('[data-quote-id]').count()===1&&await page.locator('.quote-reader-tools,.quote-reader-hint').count()===0);check('Missing editor note stays absent',await page.locator('.editor-note').count()===0);
  await page.goto(origin+'/issues/theme-zero');await expect(page.getByText('暂无书摘。')).toBeVisible();check('Zero quotes use a truthful empty state, not invented quote content',await page.locator('[data-quote-id]').count()===0);
  for(const [id,status] of [['theme-draft',404],['theme-withdrawn',410],['missing',404]]){const response=await page.goto(origin+'/issues/'+id);const text=await page.content();check(`Private/missing detail has actual${status} without data: ${id}`,response.status()===status&&!text.includes('THEME_PRIVATE_')&&!text.includes('BODY_NOT_FOR_SSR_THEME'));}
  themeSQL("UPDATE issues SET status='withdrawn',version=version+1 WHERE status='published'");const empty=await page.goto(origin);await expect(page.getByText('暂无已发布刊期。')).toBeVisible();check('Empty home remains200 and never falls back to private data',empty.status()===200&&await page.locator('[data-issue-id]').count()===0&&!(await page.content()).includes('THEME_PRIVATE_'));
  check('Actual Chrome reports no uncaught client errors',errors.length===0);result.clientErrors=errors;result.status='passed';
}catch(error){result.status='failed';result.error=error.stack??String(error);process.exitCode=1;}
finally{if(browser)await browser.close();for(const child of children.reverse())if(child.exitCode===null){const exited=once(child,'exit');process.kill(-child.pid,'SIGTERM');if(!(await Promise.race([exited.then(()=>true),wait(5000,undefined,{ref:false}).then(()=>false)])))try{process.kill(-child.pid,'SIGKILL');}catch{/* already exited */}}try{themeSQL(seed);}catch(error){result.restoreError=String(error.message);result.status='failed';process.exitCode=1;}result.finishedAt=new Date().toISOString();writeFileSync(new URL(`${mode}-result.json`,output),JSON.stringify(result,null,2));writeFileSync(new URL(`${mode}-servers.log`,output),logs.join(''));process.stdout.write(JSON.stringify(result,null,2)+'\n');}
