'use client';
import { useEffect,useId,useRef,useState } from 'react';

export function BookCover({ title,coverTitle,coverAuthor }: { title:string;coverTitle:string;coverAuthor:string }) {
  const dialog=useRef<HTMLDialogElement>(null);const trigger=useRef<HTMLButtonElement>(null);
  const id=useId();const [ready,setReady]=useState(false);
  useEffect(()=>setReady(true),[]);
  const close=()=>dialog.current?.close();
  const content=<span className="book-cover-placeholder"><span className="cover-title">{coverTitle}</span><span className="cover-divider" aria-hidden="true" />{coverAuthor&&<span className="cover-author">{coverAuthor}</span>}</span>;
  return <>
    <button ref={trigger} type="button" className="book-cover" disabled={!ready} aria-label={`放大《${title}》封面`} aria-haspopup="dialog" aria-controls={id} onClick={()=>dialog.current?.showModal()}>{content}</button>
    <dialog ref={dialog} id={id} className="cover-dialog" aria-label={`《${title}》封面大图`} onKeyDown={event=>{
      if(event.key!=='Tab')return;
      const items=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(node=>node.checkVisibility());
      const first=items[0];const last=items.at(-1);const active=document.activeElement;
      if(!first||!last)return;
      if(event.shiftKey&&(active===first||!event.currentTarget.contains(active))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(active===last||!event.currentTarget.contains(active))){event.preventDefault();first.focus();}
    }} onClose={()=>trigger.current?.focus()} onClick={event=>{if(event.target===event.currentTarget)close();}}>
      <div className="lightbox-content"><div className="book-cover enlarged">{content}</div><button type="button" className="lightbox-close" aria-label="关闭封面大图" autoFocus onClick={close}>✕</button></div>
    </dialog>
  </>;
}
