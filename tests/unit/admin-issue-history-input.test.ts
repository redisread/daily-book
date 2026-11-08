import { describe, expect, it } from 'vitest';
import { encodeIssueHistoryCursor, parseIssueHistoryPage } from '../../apps/reader/src/admin/issue-history-input';
import { InvalidRequest } from '../../apps/reader/src/domain/pagination';

describe('admin Issue history paging',()=>{
  const cursor=encodeIssueHistoryCursor('2026-11-08T04:00:00.000Z','event-1','issue-1');
  it('uses default20, caps at100 and accepts the resource-scoped cursor',()=>{
    expect(parseIssueHistoryPage(new URLSearchParams(),'issue-1')).toEqual({limit:20,cursor:null});
    expect(parseIssueHistoryPage(new URLSearchParams('limit=100&cursor='+cursor),'issue-1')).toEqual({
      limit:100,cursor:{v:1,scope:'admin-history',resourceType:'issue',resourceId:'issue-1',createdAt:'2026-11-08T04:00:00.000Z',eventId:'event-1'},
    });
  });
  it('rejects invalid, duplicated, unknown and cross-resource query values',()=>{
    for(const query of ['limit=0','limit=101','limit=01','limit=1.0','limit=1&limit=2','cursor=','cursor=x&cursor=y','status=draft','_rsc=x']){
      expect(()=>parseIssueHistoryPage(new URLSearchParams(query),'issue-1')).toThrow(InvalidRequest);
    }
    const other=encodeIssueHistoryCursor('2026-11-08T04:00:00.000Z','event-1','issue-2');
    expect(()=>parseIssueHistoryPage(new URLSearchParams('cursor='+other),'issue-1')).toThrow(InvalidRequest);
  });
  it('rejects malformed/noncanonical timestamps and cursor properties',()=>{
    const malformed=Buffer.from(JSON.stringify({v:1,scope:'admin-history',resourceType:'issue',resourceId:'issue-1',createdAt:'2026-02-30T00:00:00.000Z',eventId:'event-1'})).toString('base64url');
    const extra=Buffer.from(JSON.stringify({v:1,scope:'admin-history',resourceType:'issue',resourceId:'issue-1',createdAt:'2026-11-08T04:00:00.000Z',eventId:'event-1',extra:true})).toString('base64url');
    for(const value of [malformed,extra,'not_base64*'])expect(()=>parseIssueHistoryPage(new URLSearchParams('cursor='+value),'issue-1')).toThrow(InvalidRequest);
  });
});
