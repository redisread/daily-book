import './globals.css';
import {CANONICAL_ORIGIN} from '../src/site';
import {ReadingNavigation} from '../components/ReadingNavigation';
export const metadata={title:'每日一书 · Daily Book',description:'每天推荐一本好书，附带精选金句，让阅读成为习惯。',icons:{icon:'data:,'}};
export const viewport={width:'device-width',initialScale:1};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="zh-CN"><head><link rel="alternate" type="application/rss+xml" title="每日一书 RSS" href={`${CANONICAL_ORIGIN}/rss.xml`}/></head><body><div className="app-container">
    <a href="#main-content" className="skip-link">跳到主内容</a>
    <header className="header"><a href="/" className="logo" aria-label="每日一书首页"><span className="logo-text">每日一书</span><span className="logo-sub">Daily Book</span></a>
      <ReadingNavigation/>
    </header>
    <ReadingNavigation mobile/>
    <main id="main-content" tabIndex={-1}>{children}</main>
    <footer className="footer"><span>每日一书 © {new Date().getUTCFullYear()}</span><a href="/rss.xml">订阅RSS</a></footer>
  </div></body></html>;
}
