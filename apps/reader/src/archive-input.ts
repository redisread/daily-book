import { InvalidRequest,parsePageInput,type PageInput } from './domain/pagination';

// cursor is the only business parameter. _rsc is the framework's reserved
// transport key, not a status/filter/auth selector; it is single and bounded.
export function parseArchiveInput(params:URLSearchParams):PageInput {
  for(const key of params.keys())if(!['cursor','_rsc'].includes(key)||params.getAll(key).length!==1)
    throw new InvalidRequest('INVALID_QUERY','归档仅接受单个cursor参数。');
  const protocol=params.get('_rsc');
  if(protocol!==null&&(protocol.length>128||!/^[A-Za-z0-9_-]*$/.test(protocol)))throw new InvalidRequest('INVALID_QUERY','归档传输参数无效。');
  const business=new URLSearchParams();if(params.has('cursor'))business.set('cursor',params.get('cursor')!);
  return parsePageInput(business);
}
export function archiveSearchParams(values:Record<string,string|string[]|undefined>):URLSearchParams {
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(values))if(value!==undefined){for(const item of Array.isArray(value)?value:[value])params.append(key,item);}
  return params;
}
