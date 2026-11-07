'use client';
import {usePathname} from 'next/navigation';
export function ReadingNavigation({mobile=false}:{mobile?:boolean}) {
  const pathname=usePathname();const archive=pathname==='/archive';const search=pathname==='/search';
  const links=[{href:'/',label:'今日推荐',compact:'今日',active:!archive&&!search,current:pathname==='/'},{href:'/archive',label:'过往刊号',compact:'过往',active:archive,current:archive},{href:'/search',label:'搜索',compact:'搜索',active:search,current:search}];
  return mobile?<nav className="mobile-nav" aria-label="移动端导航"><ul className="mobile-nav-list">{links.map(link=><li className="mobile-nav-item" key={link.href}><a href={link.href} className={`mobile-nav-link${link.active?' active':''}`} aria-label={link.label} aria-current={link.current?'page':undefined}>{link.compact}</a></li>)}</ul></nav>:
    <nav className="header-nav" aria-label="主导航">{links.map(link=><a key={link.href} href={link.href} className={`nav-btn${link.active?' active':''}`} aria-current={link.current?'page':undefined}>{link.label}</a>)}</nav>;
}
