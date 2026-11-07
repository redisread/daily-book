'use client';
import {usePathname} from 'next/navigation';
export function ReadingNavigation({mobile=false}:{mobile?:boolean}) {
  const pathname=usePathname();const archive=pathname==='/archive';
  const links=[{href:'/',label:'今日推荐',active:!archive,current:pathname==='/'},{href:'/archive',label:'过往刊号',active:archive,current:archive}];
  return mobile?<nav className="mobile-nav" aria-label="移动端导航"><ul className="mobile-nav-list">{links.map(link=><li className="mobile-nav-item" key={link.href}><a href={link.href} className={`mobile-nav-link${link.active?' active':''}`} aria-current={link.current?'page':undefined}>{link.label}</a></li>)}</ul></nav>:
    <nav className="header-nav" aria-label="主导航">{links.map(link=><a key={link.href} href={link.href} className={`nav-btn${link.active?' active':''}`} aria-current={link.current?'page':undefined}>{link.label}</a>)}</nav>;
}
