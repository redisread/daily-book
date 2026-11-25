import { BookEditor } from '../../../components/BookEditor';

export const metadata = { title: '书籍管理 · 每日一书', robots: { index: false, follow: false } };
export default function BookAdminPage() {
  return <BookEditor/>;
}
