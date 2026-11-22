import { allowKeys,inputId,invalidValue,jsonObject,text,WriteError,MAX_REQUEST_BYTES } from './write-input';

export const bookColumns = {
  title:'title',author:'author',category:'category',year:'year',pages:'pages',rating:'rating',description:'description',
  coverTitle:'cover_title',coverAuthor:'cover_author',coverUrl:'cover_url',coverAlt:'cover_alt',
} as const;
export type BookField = keyof typeof bookColumns;
export type BookFields = Partial<Record<BookField,string|number|null>>;
const stringLimits: Partial<Record<BookField,number>> = { title:500,author:500,category:500,description:10000,coverTitle:500,coverAuthor:500 };
const urlBase='https://daily-book.jiahongw.com';
export function coverURL(value: unknown): string | null {
  if (value===null) return null;
  if (typeof value!=='string' || value.length===0) throw invalidValue();
  // Inspect raw text BEFORE WHATWG URL parsing (which strips some controls).
  if (/[\\\p{Cc}]/u.test(value) || /%(?![\da-f]{2})/i.test(value)) throw invalidValue();
  let decoded: string;
  try { decoded=decodeURIComponent(value); } catch { throw invalidValue(); }
  if (/[\\\p{Cc}]/u.test(decoded)) throw invalidValue();
  const relative=value.startsWith('/')&&!value.startsWith('//');
  if (relative && decoded.startsWith('//')) throw invalidValue();
  if (!relative && !/^https:\/\//i.test(value)) throw invalidValue();
  try {
    const parsed=new URL(value,urlBase);
    const decodedURL=new URL(decoded,urlBase);
    if (parsed.username || parsed.password || decodedURL.username || decodedURL.password || parsed.protocol!=='https:' || decodedURL.protocol!=='https:'
      || (relative && (parsed.origin!==urlBase || decodedURL.origin!==urlBase))) throw invalidValue();
  } catch { throw invalidValue(); }
  return value; // Never rewrite the stored original text or fetch this URL.
}
export function parseBookInput(input: unknown, create: true): BookFields & {id:string};
export function parseBookInput(input: unknown, create: false): BookFields;
export function parseBookInput(input: unknown, create: boolean): BookFields & {id?:string} {
  const object=jsonObject(input);allowKeys(object,create?['id',...Object.keys(bookColumns)]:Object.keys(bookColumns));
  if (!create && Object.keys(object).length===0) throw new WriteError(422,'EMPTY_PATCH','PATCH至少需要一个可编辑字段。');
  const result: BookFields & {id?:string}={};
  if (create) result.id=inputId(object.id);
  for (const field of Object.keys(bookColumns) as BookField[]) {
    if (!Object.hasOwn(object,field)) continue;
    const value=object[field];
    const limit=stringLimits[field];
    if (limit!==undefined) result[field]=text(value,limit);
    else if (field==='coverUrl') result[field]=coverURL(value);
    else if (field==='coverAlt') result[field]=text(value,MAX_REQUEST_BYTES,true);
    else {
      if (value!==null && (typeof value!=='number' || !Number.isFinite(value) || (field!=='rating' && !Number.isSafeInteger(value)) || (field!=='year' && value<=0))) throw invalidValue();
      result[field]=value as number|null;
    }
  }
  return result;
}
