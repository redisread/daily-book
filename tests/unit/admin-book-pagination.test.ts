import {it,expect,describe} from 'vitest';
import {Buffer} from 'node:buffer';
import {parseBookPage,parseBookHistoryPage} from '../../apps/reader/src/admin/book-page-input';
const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const history={v:1,scope:'admin-history',resourceType:'book',resourceId:'book',createdAt:'2026-11-08T01:00:00.123Z',eventId:'event'};
describe('Book/id and resource-scoped audit cursors',()=>{
  it('uses20 default and100 maximum',()=>{expect(parseBookPage(new URLSearchParams())).toEqual({limit:20,cursor:null});expect(parseBookHistoryPage(new URLSearchParams('limit=100'),'book').limit).toBe(100);});
  it.each(['limit=0','limit=101','limit=001','limit=1.5','limit=1e2','limit=1&limit=2','status=draft','_rsc=a','cursor=','cursor=x&cursor=y'])('rejects invalid query %s',q=>{expect(()=>parseBookPage(new URLSearchParams(q))).toThrow();expect(()=>parseBookHistoryPage(new URLSearchParams(q),'book')).toThrow();});
  it('accepts exact scope and cannot cross cursor types/resources',()=>{const b=new URLSearchParams({cursor:encode({v:1,scope:'admin-books',id:'book'})});const h=new URLSearchParams({cursor:encode(history)});expect(parseBookPage(b).cursor?.id).toBe('book');expect(parseBookHistoryPage(h,'book').cursor?.eventId).toBe('event');expect(()=>parseBookPage(h)).toThrow();expect(()=>parseBookHistoryPage(b,'book')).toThrow();expect(()=>parseBookHistoryPage(h,'other')).toThrow();});
  it.each([{...history,v:2},{...history,resourceType:'issue'},{...history,extra:1},{...history,createdAt:'2026-02-30T01:00:00.123Z'},{...history,eventId:'bad.id'},[]])('rejects malformed history cursor',v=>expect(()=>parseBookHistoryPage(new URLSearchParams({cursor:encode(v)}),'book')).toThrow());
  it('rejects noncanonical base64 and invalid UTF8 rather than repairing bytes',()=>{for(const cursor of ['a','not/base64',encode({v:1,scope:'admin-books',id:'book'})+'=',Buffer.from([0xff]).toString('base64url')])expect(()=>parseBookPage(new URLSearchParams({cursor}))).toThrow();});
});
