import './globals.css';
export const metadata = { title: '每日一书 · 正式读取切片' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
