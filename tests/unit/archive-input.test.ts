import {describe,it,expect} from 'vitest';
import {archiveSearchParams,parseArchiveInput} from '../../apps/reader/src/archive-input';
import {encodeCursor,InvalidRequest} from '../../apps/reader/src/domain/pagination';
describe('archive page input boundary',()=>{
  it('always fixes the public page size to20',()=>expect(parseArchiveInput(new URLSearchParams())).toEqual({limit:20,cursor:null}));
  it('reuses the existing public cursor without inventing an offset',()=>{
    const cursor=encodeCursor({id:'published-latest',publicationDate:'2026-11-01'});
    expect(parseArchiveInput(new URLSearchParams({cursor}))).toEqual({limit:20,cursor:{v:1,id:'published-latest',publicationDate:'2026-11-01'}});
  });
  for(const query of ['limit=20','status=draft','q=book','offset=20','page=2','includeDrafts=true','cursor=a&cursor=b','%63ursor=a&cursor=b','_rsc=a&_rsc=b','_rsc='+ 'x'.repeat(129),'_rsc=a%20b','cursor='])
    it(`rejects unknown/duplicate/invalid query ${query.slice(0,50)}`,()=>expect(()=>parseArchiveInput(new URLSearchParams(query))).toThrow(InvalidRequest));
  it('bounds and removes only the reserved framework transport key',()=>{
    expect(parseArchiveInput(new URLSearchParams('_rsc=abc_123-'))).toEqual({limit:20,cursor:null});
    expect(parseArchiveInput(new URLSearchParams('_rsc'))).toEqual({limit:20,cursor:null});
  });
  it('does not lose duplicate values when adapting framework searchParams',()=>{
    const params=archiveSearchParams({cursor:['a','b'],ignored:undefined});expect(params.getAll('cursor')).toEqual(['a','b']);
    expect(()=>parseArchiveInput(params)).toThrow(InvalidRequest);
  });
  it('does not accept a management cursor as a public page cursor',()=>{
    const cursor=Buffer.from(JSON.stringify({v:1,scope:'admin-issues',status:null,publicationDate:'2026-11-01',id:'x'})).toString('base64url');
    expect(()=>parseArchiveInput(new URLSearchParams({cursor}))).toThrow(InvalidRequest);
  });
});
