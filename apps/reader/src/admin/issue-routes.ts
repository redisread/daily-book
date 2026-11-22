import { validId, InvalidRequest } from '../domain/pagination';
import { apiError } from '../http';
import { requireAdmin } from './auth';
import { adminRead, privateResponse, rejectAdminMethod } from './http';
import type { WriteObserver, WriteIntent } from './atomic-write';
import { parseIssueCreateInput, parseIssuePatchInput } from './issue-input';
import { issueHistory } from './issues';
import { createIssue, patchIssue, transitionIssue } from './issue-writes';
import { issueIfMatch, idempotencyKey, readJSON, requestDigest, WriteError } from './write-input';

type Action='publish'|'withdraw'|'restore';
function routeError(error:unknown):Response {
  const response=error instanceof WriteError?apiError(error.status,error.code,error.message)
    :error instanceof InvalidRequest?apiError(400,error.code,error.message)
      :apiError(503,'WRITE_UNAVAILABLE','管理写入暂不可用。请保留原请求信息。');
  if(error instanceof WriteError&&error.code==='IDEMPOTENCY_IN_PROGRESS')response.headers.set('Retry-After','1');
  return privateResponse(response);
}
export async function issueWriteRoute(request:Request,id:string|null,action:Action|null,observer?:WriteObserver):Promise<Response> {
  try {
    const denied=await requireAdmin(request);if(denied)return privateResponse(denied);
    if(new URL(request.url).searchParams.size)throw new InvalidRequest('INVALID_QUERY','写入接口不接受查询参数。');
    if(id!==null&&!validId(id))return privateResponse(apiError(404,'ISSUE_NOT_FOUND','刊期不存在。'));
    const key=idempotencyKey(request.headers);const tag=id===null?null:issueIfMatch(request.headers);
    const body=await readJSON(request);
    if(id===null){
      const input=parseIssueCreateInput(body);const path='/api/v1/admin/issues';
      const digest=await requestDigest('POST',path,body,null);
      const intent:WriteIntent={key,digest,resourceType:'issue',resourceId:input.id,operation:'issue.create',method:'POST',path};
      return privateResponse(await createIssue(intent,input,observer));
    }
    const path='/api/v1/admin/issues/'+encodeURIComponent(id);
    if(action!==null){
      if(Object.keys(body).length)throw new WriteError(400,'UNKNOWN_FIELD','请求包含不允许的字段。');
      const actionPath=`${path}/${action}`;const digest=await requestDigest('POST',actionPath,body,tag);
      const intent:WriteIntent={key,digest,resourceType:'issue',resourceId:id,operation:`issue.${action}`,method:'POST',path:actionPath};
      return privateResponse(await transitionIssue(intent,id,action,tag!,observer));
    }
    const input=parseIssuePatchInput(body,new Set());const digest=await requestDigest('PATCH',path,body,tag);
    const intent:WriteIntent={key,digest,resourceType:'issue',resourceId:id,operation:'issue.patch',method:'PATCH',path};
    return privateResponse(await patchIssue(intent,id,input,tag!,observer));
  }catch(error){return routeError(error);}
}

export async function issueHistoryRoute(request:Request,id:string):Promise<Response> {
  const response=await adminRead(request,()=>issueHistory(id,new URL(request.url).searchParams));
  return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
}

export async function rejectIssueMethod(request:Request,allow:string):Promise<Response>{
  return rejectAdminMethod(request,allow);
}
