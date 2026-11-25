import { InvalidRequest } from './pagination';

export const libraryPageSize = 24;
export function libraryQuery(params: URLSearchParams, rsc = false) {
  const allowed = rsc ? ['q', 'page', '_rsc'] : ['q', 'page'];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      throw new InvalidRequest('INVALID_QUERY', '书籍库参数无效。');
    }
  }
  const query = (params.get('q') ?? '').trim();
  const rawPage = params.get('page') ?? '1';
  if ([...query].length > 100 || !/^[1-9][0-9]{0,6}$/.test(rawPage)) {
    throw new InvalidRequest('INVALID_QUERY', '书籍库参数无效。');
  }
  const page = Number(rawPage);
  return { query, page, offset: (page - 1) * libraryPageSize };
}
