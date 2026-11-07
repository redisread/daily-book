'use client';
import { useEffect,useId,useRef,useState } from 'react';
import type { Quote } from '../src/domain/types';

export function QuoteReader({ quotes,author,title }: {quotes:Quote[];author:string;title:string}) {
  const track=useRef<HTMLDivElement>(null);const id=useId();const [active,setActive]=useState(0);const [ready,setReady]=useState(false);
  function update() {
    if(!track.current)return;
    const left=track.current.getBoundingClientRect().left;
    const cards=[...track.current.querySelectorAll<HTMLElement>('[data-quote-id]')];
    const distances=cards.map(card=>Math.abs(card.getBoundingClientRect().left-left));
    if(distances.length)setActive(distances.indexOf(Math.min(...distances)));
  }
  useEffect(()=>{
    setReady(true);const observer=new ResizeObserver(update);if(track.current)observer.observe(track.current);
    return()=>observer.disconnect();
  },[]);
  function go(index:number) {
    const cards=track.current?.querySelectorAll<HTMLElement>('[data-quote-id]');
    const next=Math.max(0,Math.min(quotes.length-1,index));
    cards?.[next]?.scrollIntoView({block:'nearest',inline:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  if(!quotes.length)return <section className="quote-empty" aria-label="书摘"><p>暂无书摘。</p></section>;
  return <section className="quote-section" aria-label="精选书摘">
    <h2 className="sr-only">书摘</h2>
    <div ref={track} id={id} className="quote-reader" role="region" aria-label="书摘列表，窄屏可左右滑动或使用方向键" tabIndex={0} onScroll={update} onKeyDown={event=>{
      if(!matchMedia('(max-width: 768px)').matches)return;
      if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();go(active+(event.key==='ArrowRight'?1:-1));}
      if(event.key==='Home'||event.key==='End'){event.preventDefault();go(event.key==='Home'?0:quotes.length-1);}
    }}>
      {quotes.map(quote=><blockquote className="quote-card" data-quote-id={quote.id} key={quote.id}><div className="quote-mark" aria-hidden="true">“</div><p className="quote-text">{quote.text}</p><cite className="quote-source">——{author}《{title}》{quote.sourceLabel}</cite></blockquote>)}
    </div>
    {quotes.length>1&&<div className="quote-reader-tools">
      <button type="button" className="date-arrow" aria-label="上一条书摘" aria-controls={id} disabled={!ready||active===0} onClick={()=>go(active-1)}>←</button>
      <p className="quote-reader-count" role="status" aria-live="polite">第 {active+1} / {quotes.length} 条</p>
      <button type="button" className="date-arrow" aria-label="下一条书摘" aria-controls={id} disabled={!ready||active===quotes.length-1} onClick={()=>go(active+1)}>→</button>
    </div>}
    {quotes.length>1&&<p className="quote-reader-hint">左右滑动，或使用方向键切换书摘</p>}
  </section>;
}
