'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { LibraryBook } from '../src/domain/book-library';

const fields = [
  ['title', '书名'], ['author', '作者'], ['category', '分类'],
  ['coverTitle', '封面书名'], ['coverAuthor', '封面作者'], ['coverUrl', '封面地址'], ['alt', '封面替代文本'],
  ['year', '首版年份'], ['pages', '页数'], ['rating', '评分'],
  ['description', '简介'], ['editorNote', '编者按'], ['body', '内部正文'],
] as const;
const labels = { draft: '草稿', published: '已发布', withdrawn: '已下架' };
const emptyBook = (): LibraryBook => ({
  id: '', status: 'draft', title: '', author: '', category: '', coverTitle: '', coverAuthor: '', coverUrl: null, alt: null,
  year: null, pages: null, rating: null, description: '', editorNote: null, body: '', quotes: [],
  version: 0, createdAt: '', updatedAt: '',
});
const base = '/api/v1/admin/books';
type PendingWrite = { signature: string; key: string };

export function BookEditor() {
  const access = useRef<HTMLInputElement>(null);
  const pending = useRef<PendingWrite | null>(null);
  const [lookupId, setLookupId] = useState('');
  const [current, setCurrent] = useState<LibraryBook | null>(null);
  const [etag, setETag] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function send(path: string, method: 'GET' | 'POST' | 'PATCH', body?: string) {
    const key = access.current?.value.trim();
    if (!key) {
      setMessage('请输入管理密钥。');
      access.current?.focus();
      return;
    }
    setBusy(true);
    setMessage('');
    const headers = new Headers({ Authorization: 'Bearer ' + key });
    if (body !== undefined) {
      const signature = JSON.stringify([method, path, body, etag]);
      if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
      headers.set('Content-Type', 'application/json');
      headers.set('Idempotency-Key', pending.current.key);
      if (etag) headers.set('If-Match', etag);
    }
    try {
      const response = await fetch(path, { method, headers, body, cache: 'no-store' });
      if (body !== undefined && response.status < 500 && response.status !== 429) pending.current = null;
      const payload = await response.json() as { data?: LibraryBook; error?: { message: string } };
      if (!response.ok || !payload.data) {
        setMessage(payload.error?.message ?? '操作失败，请重试。');
        return;
      }
      setCurrent(payload.data);
      setETag(response.headers.get('ETag') ?? '');
      setDirty(false);
      setLookupId(payload.data.id);
      setMessage(method === 'GET' ? '已读取书籍。' : '已保存。');
    } catch {
      setMessage('连接失败。请保留所填内容并重试。');
    } finally {
      setBusy(false);
    }
  }

  function edit(update: Partial<LibraryBook>) {
    setCurrent(book => book && { ...book, ...update });
    setDirty(true);
  }
  function newBook() {
    setCurrent(emptyBook());
    setETag('');
    setDirty(true);
    setMessage('');
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const { id, alt, quotes } = current;
    const bookFields = Object.fromEntries(fields.filter(([field]) => field !== 'alt').map(([field]) => [field, current[field]]));
    const body = JSON.stringify({
      ...bookFields, ...(etag ? {} : { id }), coverAlt: alt,
      quotes: quotes.map(({ id, text, sourceLabel }) => ({ id, text, sourceLabel })),
    });
    void send(etag ? base + '/' + encodeURIComponent(id) : base, etag ? 'PATCH' : 'POST', body);
  }

  return <section className="library-page book-editor">
    <h1>书籍管理</h1>
    <label>管理密钥<input ref={access} type="password" autoComplete="off"/></label>
    <form onSubmit={event => { event.preventDefault(); void send(base + '/' + encodeURIComponent(lookupId.trim()), 'GET'); }}>
      <label>查找书籍 ID<input value={lookupId} required onChange={event => setLookupId(event.target.value)}/></label>
      <div className="editor-actions">
        <button disabled={busy} type="submit">读取书籍</button>
        <button disabled={busy} type="button" onClick={newBook}>新建草稿</button>
      </div>
    </form>
    <p role="status">{message}</p>
    {current && <form onSubmit={save}>
      <fieldset disabled={busy}>
        <legend>{labels[current.status]}</legend>
        <label>书籍 ID<input required pattern="[A-Za-z0-9][A-Za-z0-9_\\-]*" maxLength={128} readOnly={Boolean(etag)}
          value={current.id} onChange={event => edit({ id: event.target.value })}/></label>
        <div className="editor-fields">{fields.map(([field, label]) => {
          const value = current[field] ?? '';
          if (field === 'description' || field === 'editorNote' || field === 'body') {
            return <label key={field} className="editor-wide">{label}<textarea value={value} onChange={event => edit({ [field]: event.target.value })}/></label>;
          }
          const numeric = field === 'year' || field === 'pages' || field === 'rating';
          return <label key={field}>{label}<input value={value} type={numeric ? 'number' : 'text'} step={field === 'rating' ? 'any' : undefined}
            onChange={event => {
              const value = event.target.value;
              edit({ [field]: numeric ? (value === '' ? null : Number(value)) : field === 'coverUrl' && !value ? null : value });
            }}/></label>;
        })}</div>
        <h2>书摘</h2>
        {current.quotes.map((quote, index) => <fieldset key={quote.id}>
          <legend>书摘 {index + 1}</legend>
          <label>摘录<textarea value={quote.text}
            onChange={event => edit({ quotes: current.quotes.map(item => item.id === quote.id ? { ...item, text: event.target.value } : item) })}/></label>
          <label>出处<input value={quote.sourceLabel}
            onChange={event => edit({ quotes: current.quotes.map(item => item.id === quote.id ? { ...item, sourceLabel: event.target.value } : item) })}/></label>
          <button type="button" onClick={() => edit({ quotes: current.quotes.filter(item => item.id !== quote.id) })}>移除此书摘</button>
        </fieldset>)}
        <button type="button" onClick={() => edit({ quotes: [...current.quotes, { id: crypto.randomUUID(), text: '', sourceLabel: '', position: current.quotes.length }] })}>添加书摘</button>
        <div className="editor-actions"><button className="editor-primary" type="submit">{etag ? '保存修改' : '保存草稿'}</button>
        {etag && <button type="button" disabled={dirty} onClick={() => {
          const action = current.status === 'draft' ? 'publish' : current.status === 'published' ? 'withdraw' : 'restore';
          void send(base + '/' + encodeURIComponent(current.id) + '/' + action, 'POST', '{}');
        }}>{current.status === 'draft' ? '发布书籍' : current.status === 'published' ? '下架书籍' : '恢复上架'}</button>}
        {current.status === 'published' && <a href={'/books/' + encodeURIComponent(current.id)}>查看公开书页</a>}
        </div>
      </fieldset>
    </form>}
  </section>;
}
