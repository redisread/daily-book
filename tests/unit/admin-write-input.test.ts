import {describe,it,expect} from 'vitest';
import {parseBookInput,coverURL} from '../../apps/reader/src/admin/book-input';
import {canonicalJSON,bookIfMatch,idempotencyKey,readJSON,requestDigest,WriteError} from '../../apps/reader/src/admin/write-input';

const failure=(fn:()=>unknown,status:number,code?:string)=>{try{fn();throw Error('Expected rejection');}catch(e){expect(e).toBeInstanceOf(WriteError);expect((e as WriteError).status).toBe(status);if(code)expect((e as WriteError).code).toBe(code);}};
describe('Book command input contract',()=>{
  it('accepts id-only create without filling or rewriting content',()=>expect(parseBookInput({id:'book-1'},true)).toEqual({id:'book-1'}));
  it('rejects empty PATCH; accepts same-value-capable nonempty fields without trimming',()=>{failure(()=>parseBookInput({},false),422,'EMPTY_PATCH');expect(parseBookInput({title:'\n 文本 \n',coverAlt:null,rating:15},false)).toEqual({title:'\n 文本 \n',coverAlt:null,rating:15});});
  it.each(['id','version','createdAt','updatedAt','alt','actor','__proto__'])('rejects unknown PATCH %s',field=>failure(()=>parseBookInput(JSON.parse(`{"${field}":1}`),false),400,'UNKNOWN_FIELD'));
  it.each([null,[],1,'text'])('rejects nonobject body %j',value=>failure(()=>parseBookInput(value,true),422));
  it.each([{id:''},{id:'x.y'},{id:'x'.repeat(129)},{id:1}])('rejects bad create identity',value=>failure(()=>parseBookInput(value,true),422));
  it.each([{title:null},{description:1},{pages:0},{pages:1.5},{year:1e30},{rating:-1},{rating:Infinity},{coverAlt:1}])('rejects invalid field types/ranges',value=>failure(()=>parseBookInput(value,false),422));
  it('counts Unicode code points without NFC/trim',()=>{expect(parseBookInput({title:'😀'.repeat(500)},false).title).toHaveLength(1000);failure(()=>parseBookInput({title:'😀'.repeat(501)},false),422);expect(parseBookInput({year:-40,pages:null,rating:null},false)).toEqual({year:-40,pages:null,rating:null});});
  it.each(['https://example.com/a%20b?x=1','/covers/original/中文.png','/a/../b',null])('allows safe cover URL preserving input %s',value=>expect(coverURL(value)).toBe(value));
  it.each(['','//evil.example/x','http://example.com','javascript:alert(1)','https://user:pass@example.com','https://example.com/\\x','/\n/x','/%0a/x','/%5c/x','/%2fevil.example/x','/%2fdaily-book.jiahongw.com/x','https://example.com/%7f','/bad%','/%ff'])('rejects dangerous/unparseable cover URL %s',value=>failure(()=>coverURL(value),422));
});
describe('Strong conditions and idempotency semantics',()=>{
  it('requires one syntactically valid strong Book tag without normalizing',()=>{expect(bookIfMatch(new Headers({'If-Match':'"b:other:2"'}))).toBe('"b:other:2"');failure(()=>bookIfMatch(new Headers()),428);for(const tag of ['*','W/"b:a:1"','"b:a:01"','"b:a:1", "b:a:2"','"b:a:9007199254740992"'])failure(()=>bookIfMatch(new Headers({'If-Match':tag})),400);});
  it('validates the original stable ASCII key',()=>{expect(idempotencyKey(new Headers({'Idempotency-Key':'a'.repeat(16)}))).toBe('a'.repeat(16));for(const key of ['', 'a'.repeat(15),'a'.repeat(129),'a'.repeat(16)+',other','é'.repeat(16)])failure(()=>idempotencyKey(new Headers({'Idempotency-Key':key})),400);});
  it('canonicalizes JSON object order recursively but not arrays or text',async()=>{expect(canonicalJSON({z:[{b:2,a:1},3],a:'e\u0301'})).toBe('{"a":"é","z":[{"a":1,"b":2},3]}');const body={title:' 文本 ',year:1};expect(await requestDigest('PATCH','/books/a',body,'"b:a:1"')).toBe(await requestDigest('PATCH','/books/a',{year:1,title:' 文本 '},'"b:a:1"'));expect(await requestDigest('PATCH','/books/a',body,'"b:a:2"')).not.toBe(await requestDigest('PATCH','/books/a',body,'"b:a:1"'));});
  it('bounds the actual stream even with dishonest Content-Length',async()=>{const r=new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'1'},body:JSON.stringify({title:'x'.repeat(256*1024)})});await expect(readJSON(r)).rejects.toMatchObject({status:413});});
  it('rejects MIME/syntax/type errors distinctly',async()=>{await expect(readJSON(new Request('https://x',{method:'POST',body:'{}'}))).rejects.toMatchObject({status:415});await expect(readJSON(new Request('https://x',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}))).rejects.toMatchObject({status:400});await expect(readJSON(new Request('https://x',{method:'POST',headers:{'Content-Type':'application/json'},body:'[]'}))).rejects.toMatchObject({status:422});});
});
