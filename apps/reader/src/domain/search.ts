import {env} from 'cloudflare:workers';
import {encodeSearchCursor,type SearchInput} from './search-input';
export interface SearchItem {id:string;date:string;number:number;title:string;author:string}
export interface SearchPage {items:SearchItem[];nextCursor:string|null}
export async function searchPublishedIssues({normalizedQ,limit,cursor}:SearchInput):Promise<SearchPage> {
  // instr is a literal substring search: %/_ are not wildcards. SQLite lower()
  // folds ASCII only; non-ASCII codepoints are exact, with no NFC/tokenization.
  const boundary=cursor?'AND (i.publication_date < ? OR (i.publication_date = ? AND i.id < ?))':'';
  const result=await env.DB.prepare(`SELECT i.id,i.publication_date AS date,i.issue_number AS number,b.title,b.author
    FROM issues i JOIN books b ON b.id=i.book_id WHERE i.status='published' AND (
      instr(lower(b.title),?)>0 OR instr(lower(b.author),?)>0 OR instr(lower(b.category),?)>0 OR
      instr(lower(b.description),?)>0 OR instr(lower(coalesce(i.editor_note,'')),?)>0)
    ${boundary} ORDER BY i.publication_date DESC,i.id DESC LIMIT ?`)
    .bind(normalizedQ,normalizedQ,normalizedQ,normalizedQ,normalizedQ,...(cursor?[cursor.publicationDate,cursor.publicationDate,cursor.id]:[]),limit+1).all<SearchItem>();
  const items=result.results.slice(0,limit);return {items,nextCursor:result.results.length>limit?encodeSearchCursor(items.at(-1)!,normalizedQ):null};
}
