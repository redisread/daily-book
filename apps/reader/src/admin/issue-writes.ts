import { env } from 'cloudflare:workers';
import { ISSUE_JSON } from '../domain/issue-projection';
import type { IssueQuoteInput } from './issue-input';
import { assertFirstPublicationComplete, assertIssueTransition } from './issue-input';
import { issueETag, issueETagFromAuditSQL, issueETagFromRowSQL } from './etag';
import { readAdminBook, readAdminIssue, type AdminIssue } from './issues';
import { atomicWrite, type AtomicPlan, type SqlValue, type WriteIntent, type WriteObserver } from './atomic-write';
import { WriteError } from './write-input';

const issueSnapshot=(id:string):SqlValue=>({sql:`SELECT ${ISSUE_JSON} FROM issues i JOIN books b ON b.id=i.book_id WHERE i.id=?`,values:[id]});
const quoteConflict=async(ids:readonly IssueQuoteInput[],issueId:string):Promise<boolean>=>{
  if(!ids.length)return false;
  for(let offset=0;offset<ids.length;offset+=99){
    const chunk=ids.slice(offset,offset+99);const placeholders=chunk.map(()=>'?').join(',');
    const found=await env.DB.prepare(`SELECT id FROM quotes WHERE issue_id<>? AND id IN (${placeholders}) LIMIT 1`).bind(issueId,...chunk.map(quote=>quote.id)).first();
    if(found)return true;
  }
  return false;
};
const expectedQuotes=(quotes:readonly IssueQuoteInput[]|undefined,issueId:string):D1PreparedStatement[]=>{
  if(quotes===undefined)return[];
  const statements:D1PreparedStatement[]=[];
  // D1 allows at most 100 bound parameters per statement; each quote uses five.
  for(let offset=0;offset<quotes.length;offset+=20){
    const chunk=quotes.slice(offset,offset+20);const tuple=chunk.map(()=>'(?,?,?,?,?)').join(',');
    const values=chunk.flatMap((quote,index)=>[quote.id,issueId,quote.text,quote.sourceLabel,offset+index]);
    statements.push(env.DB.prepare(`INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES ${tuple}`).bind(...values));
  }
  return statements;
};
function quoteWitness(quotes:readonly IssueQuoteInput[]|undefined,issueId:string):SqlValue {
  if(quotes===undefined)return{sql:'SELECT 1',values:[]};
  const expected=JSON.stringify(quotes.map((quote,position)=>[quote.id,quote.text,quote.sourceLabel,position]));
  return{
    sql:`SELECT EXISTS(SELECT 1 FROM issues i WHERE i.id=? AND i.version=coalesce(json_extract(r.before_json,'$.version'),0)+1
      AND i.updated_at=r.started_at) AND (SELECT count(*) FROM quotes WHERE issue_id=?)=?
      AND NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM quotes q WHERE q.issue_id=?
        AND q.id=json_extract(e.value,'$[0]') AND q.text=json_extract(e.value,'$[1]')
        AND q.source_label=json_extract(e.value,'$[2]') AND q.position=json_extract(e.value,'$[3]')))`,
    values:[issueId,issueId,quotes.length,expected,issueId],
  };
}
function etagSQL(id:string,bookId:string):string{return issueETagFromAuditSQL(id,bookId);}
function issueEtagForIntent(intent:WriteIntent,bookId:string):string {
  return etagSQL(intent.resourceId,bookId);
}

export async function createIssue(intent:WriteIntent,input:{id:string;bookId:string;editorNote?:string|null;body?:string;quotes?:IssueQuoteInput[]},observer?:WriteObserver):Promise<Response>{
  const {id,bookId,editorNote,body,quotes}=input;
  return atomicWrite(intent,operationId=>{
    const columns=['id','book_id'];const values:(string|null)[]=[id,bookId];
    if(editorNote!==undefined){columns.push('editor_note');values.push(editorNote);}
    if(body!==undefined){columns.push('body');values.push(body);}
    const timestamp='(SELECT started_at FROM admin_write_receipts WHERE operation_id=?)';
    const mutation=env.DB.prepare(`INSERT INTO issues(${columns.join(',')},created_at,updated_at) VALUES(${columns.map(()=>'?').join(',')},${timestamp},${timestamp})`)
      .bind(...values,operationId,operationId);
    const allQuotes=quotes??[];
    const witness=quoteWitness(allQuotes,id);
    const plan:AtomicPlan={
      before:issueSnapshot(id),
      condition:{sql:'SELECT NOT EXISTS(SELECT 1 FROM issues WHERE id=?) AND EXISTS(SELECT 1 FROM books WHERE id=?)',values:[id,bookId]},
      mutations:[mutation,...expectedQuotes(allQuotes,id)],
      mutationWitness:witness,
      after:issueSnapshot(id),
      etagFromAuditSQL:etagSQL(id,bookId),status:201,location:`${intent.path}/${encodeURIComponent(id)}`,
      async classifyFailure():Promise<never>{
        if(await readAdminIssue(id))throw new WriteError(409,'ISSUE_EXISTS','刊期ID已存在。');
        if(!await readAdminBook(bookId))throw new WriteError(404,'BOOK_NOT_FOUND','书目不存在。');
        if(await quoteConflict(allQuotes,id))throw new WriteError(409,'QUOTE_ID_EXISTS','书摘ID已被其他刊期使用。');
        throw new WriteError(503,'WRITE_UNAVAILABLE','管理写入暂不可用。请保留原请求信息。');
      },
    };
    // The issue snapshot is captured before quote insertion in the first batch
    // statement; after_json captures the whole final quote set in that batch.
    return plan;
  },observer);
}

export async function patchIssue(intent:WriteIntent,id:string,input:{editorNote?:string|null;body?:string;quotes?:IssueQuoteInput[]},ifMatch:string,observer?:WriteObserver):Promise<Response>{
  return atomicWrite(intent,async operationId=>{
    const current=await readAdminIssue(id);const bookId=current?.bookId??'';const before=issueSnapshot(id);
    const entries:[string,string|null][]=[];
    if(Object.hasOwn(input,'editorNote'))entries.push(['editor_note',input.editorNote??null]);
    if(Object.hasOwn(input,'body'))entries.push(['body',input.body??'']);
    const assignments=entries.map(([column])=>`${column}=?,`).join('');
    const update=env.DB.prepare(`UPDATE issues AS target SET ${assignments}version=version+1,updated_at=(SELECT started_at FROM admin_write_receipts WHERE operation_id=?)
      WHERE target.id=? AND target.book_id=? AND target.version<9007199254740991 AND EXISTS(
        SELECT 1 FROM books b WHERE b.id=target.book_id AND b.version<9007199254740991
          AND (${issueETagFromRowSQL(id,bookId,'target','b')})=?)`).bind(...entries.map(([,value])=>value),operationId,id,bookId,ifMatch);
    const quoteMutations=input.quotes===undefined?[]:[
      env.DB.prepare('DELETE FROM quotes WHERE issue_id=?').bind(id),...expectedQuotes(input.quotes,id),
    ];
    const plan:AtomicPlan={
      before,
      condition:{sql:`SELECT EXISTS(SELECT 1 FROM issues i JOIN books b ON b.id=i.book_id WHERE i.id=? AND i.book_id=?
        AND i.version<9007199254740991 AND b.version<9007199254740991 AND (${issueETagFromRowSQL(id,bookId)})=?)`,values:[id,bookId,ifMatch]},
      mutations:[update,...quoteMutations],
      mutationWitness:input.quotes===undefined
        ?{sql:`SELECT EXISTS(SELECT 1 FROM issues i WHERE i.id=? AND i.version=coalesce(json_extract(r.before_json,'$.version'),0)+1
          AND i.book_id=json_extract(r.before_json,'$.bookId') AND i.updated_at=r.started_at)`,values:[id]}
        :quoteWitness(input.quotes,id),
      after:issueSnapshot(id),etagFromAuditSQL:issueEtagForIntent(intent,bookId),status:200,location:null,
      async classifyFailure():Promise<never>{
        const latest=await readAdminIssue(id);
        if(!latest)throw new WriteError(404,'ISSUE_NOT_FOUND','刊期不存在。');
        if(issueETag(latest)!==ifMatch)throw new WriteError(412,'PRECONDITION_FAILED','资源版本已变化。');
        if(input.quotes!==undefined&&await quoteConflict(input.quotes,id))throw new WriteError(422,'INVALID_VALUE','请求包含其他刊期的书摘ID。');
        throw new WriteError(503,'WRITE_UNAVAILABLE','管理写入暂不可用。请保留原请求信息。');
      },
    };
    return plan;
  },observer);
}

type LifecycleAction='publish'|'withdraw'|'restore';
const sourceStatus:Record<LifecycleAction,AdminIssue['status']>={publish:'draft',withdraw:'published',restore:'withdrawn'};
export async function transitionIssue(intent:WriteIntent,id:string,action:LifecycleAction,ifMatch:string,observer?:WriteObserver):Promise<Response>{
  return atomicWrite(intent,async operationId=>{
    const current=await readAdminIssue(id);const bookId=current?.bookId??'';const before=issueSnapshot(id);
    const expected=sourceStatus[action];
    const tagIsCurrent=current!==null&&issueETag(current)===ifMatch;
    if(action==='publish'&&current?.status==='draft'&&tagIsCurrent){
      assertFirstPublicationComplete(current.book,current.editorNote,current.quotes);
    }
    // Legacy withdrawn issues remain restorable even when their old content no
    // longer satisfies today's first-publication requirements.
    const nextStatus=tagIsCurrent?assertIssueTransition(current!.status,action):action==='withdraw'?'withdrawn':'published';
    const statusExpression=`'${nextStatus}'`;
    const publicationFields=action==='publish'
      ?",publication_date=date('now','+8 hours'),issue_number=(SELECT coalesce(max(issue_number),0)+1 FROM issues)"
      :'';
    const dayAvailable=action==='publish'?`AND NOT EXISTS(SELECT 1 FROM issues WHERE publication_date=date('now','+8 hours'))
      AND (SELECT coalesce(max(issue_number),0) FROM issues)<9007199254740991`:'';
    const conditional={sql:`SELECT EXISTS(SELECT 1 FROM issues i JOIN books b ON b.id=i.book_id WHERE i.id=? AND i.status=? AND i.book_id=?
      AND i.version<9007199254740991 AND b.version<9007199254740991 AND (${issueETagFromRowSQL(id,bookId)})=? ${dayAvailable})`,
      values:[id,expected,bookId,ifMatch]};
    const mutation=env.DB.prepare(`UPDATE issues AS target SET status=${statusExpression}${publicationFields},version=version+1,
      updated_at=(SELECT started_at FROM admin_write_receipts WHERE operation_id=?) WHERE target.id=? AND target.status=? AND target.book_id=?
      AND target.version<9007199254740991 AND EXISTS(SELECT 1 FROM books b WHERE b.id=target.book_id AND b.version<9007199254740991
        AND (${issueETagFromRowSQL(id,bookId,'target','b')})=?) ${dayAvailable}`)
      .bind(operationId,id,expected,bookId,ifMatch);
    const plan:AtomicPlan={
      before,condition:conditional,mutations:[mutation],
      mutationWitness:{sql:`SELECT EXISTS(SELECT 1 FROM issues i WHERE i.id=? AND i.status=? AND i.version=coalesce(json_extract(r.before_json,'$.version'),0)+1
        AND i.updated_at=r.started_at ${action==='publish'?"AND i.publication_date=date('now','+8 hours') AND i.issue_number=(SELECT max(issue_number) FROM issues)":""})`,
        values:[id,statusExpression.replaceAll("'",'')]},
      after:issueSnapshot(id),etagFromAuditSQL:issueEtagForIntent(intent,bookId),status:200,location:null,
      async classifyFailure():Promise<never>{
        const latest=await readAdminIssue(id);
        if(!latest)throw new WriteError(404,'ISSUE_NOT_FOUND','刊期不存在。');
        if(issueETag(latest)!==ifMatch)throw new WriteError(412,'PRECONDITION_FAILED','资源版本已变化。');
        if(latest.status!==expected)throw new WriteError(409,'INVALID_STATE','刊期当前状态不允许此操作。');
        if(action==='publish'){
          const occupied=await env.DB.prepare("SELECT id FROM issues WHERE publication_date=date('now','+8 hours') LIMIT 1").first();
          if(occupied)throw new WriteError(409,'PUBLICATION_DATE_TAKEN','北京时间当天已发布其他刊期。');
          if(latest.version>=9007199254740991)throw new WriteError(409,'VERSION_EXHAUSTED','资源版本已达到上限。');
        }
        throw new WriteError(503,'WRITE_UNAVAILABLE','管理写入暂不可用。请保留原请求信息。');
      },
    };
    return plan;
  },observer);
}
