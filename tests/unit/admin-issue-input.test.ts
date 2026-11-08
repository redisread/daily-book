import { describe, expect, it } from 'vitest';
import {
  assertFirstPublicationComplete,
  assertIssueTransition,
  parseIssueCreateInput,
  parseIssuePatchInput,
  type FirstPublicationBook,
  type IssueQuoteInput,
} from '../../apps/reader/src/admin/issue-input';
import { issueIfMatch, WriteError } from '../../apps/reader/src/admin/write-input';

const validBook: FirstPublicationBook = {
  title: 'Book title',
  author: 'Author',
  category: 'Category',
  description: 'Description',
};
const validNote = '书'.repeat(40);
const validQuotes: IssueQuoteInput[] = [{ id: 'quote-1', text: '摘录内容', sourceLabel: '第1章' }];

function expectIssueError(run: () => unknown, status: number, code: string) {
  try {
    run();
    throw new Error('expected issue input error');
  } catch (error) {
    expect(error).toBeInstanceOf(WriteError);
    expect(error).toMatchObject({ status, code });
  }
}

describe('admin issue input', () => {
  it('creates drafts with only the documented mutable content fields', () => {
    expect(parseIssueCreateInput({ id: 'issue-1', bookId: 'book-1', editorNote: null, body: '', quotes: [] })).toEqual({
      id: 'issue-1', bookId: 'book-1', editorNote: null, body: '', quotes: [],
    });
    for (const forbidden of ['status', 'publicationDate', 'issueNumber', 'version']) {
      expectIssueError(() => parseIssueCreateInput({ id: 'issue-1', bookId: 'book-1', [forbidden]: 'forbidden' }), 400, 'UNKNOWN_FIELD');
    }
  });

  it('allows new/current quote IDs and rejects IDs already owned by another issue', () => {
    expect(parseIssuePatchInput({ quotes: [{ id: 'existing-1', text: 'new text', sourceLabel: 'p. 3' }] }, new Set(['existing-1'])))
      .toEqual({ quotes: [{ id: 'existing-1', text: 'new text', sourceLabel: 'p. 3' }] });
    expect(parseIssuePatchInput({ quotes: [] }, new Set(['existing-1']))).toEqual({ quotes: [] });
    expect(parseIssuePatchInput({ quotes: [{ id: 'new-quote', text: 'x', sourceLabel: 'y' }] }, new Set(['existing-1'])))
      .toEqual({ quotes: [{ id: 'new-quote', text: 'x', sourceLabel: 'y' }] });
    expectIssueError(() => parseIssuePatchInput(
      { quotes: [{ id: 'another-issue-quote', text: 'x', sourceLabel: 'y' }] },
      new Set(['existing-1']), new Set(['another-issue-quote']),
    ), 422, 'INVALID_VALUE');
  });

  it('rejects duplicate quote IDs, caller positions and unknown fields', () => {
    expectIssueError(() => parseIssueCreateInput({ id: 'issue-1', bookId: 'book-1', quotes: [
      { id: 'same', text: 'a', sourceLabel: 'p1' }, { id: 'same', text: 'b', sourceLabel: 'p2' },
    ] }), 422, 'INVALID_VALUE');
    expectIssueError(() => parseIssueCreateInput({ id: 'issue-1', bookId: 'book-1', quotes: [{ id: 'q1', text: 'a', sourceLabel: 'p1', position: 0 }] }), 400, 'UNKNOWN_FIELD');
    expectIssueError(() => parseIssueCreateInput({ id: 'issue-1', bookId: 'book-1', body: 'x'.repeat(100_001) }), 422, 'INVALID_VALUE');
  });

  it('requires complete first-publication fields, a 40–100-code-point note and 1–10 nonempty quotes', () => {
    expect(() => assertFirstPublicationComplete(validBook, validNote, validQuotes)).not.toThrow();
    expect(() => assertFirstPublicationComplete(validBook, '书'.repeat(40), validQuotes)).not.toThrow();
    expect(() => assertFirstPublicationComplete(validBook, '书'.repeat(100), validQuotes)).not.toThrow();
    expectIssueError(() => assertFirstPublicationComplete({ ...validBook, title: '  ' }, validNote, validQuotes), 422, 'INVALID_VALUE');
    expectIssueError(() => assertFirstPublicationComplete(validBook, '书'.repeat(39), validQuotes), 422, 'INVALID_VALUE');
    expectIssueError(() => assertFirstPublicationComplete(validBook, '书'.repeat(101), validQuotes), 422, 'INVALID_VALUE');
    expectIssueError(() => assertFirstPublicationComplete(validBook, validNote, []), 422, 'INVALID_VALUE');
    expectIssueError(() => assertFirstPublicationComplete(validBook, validNote, Array.from({ length: 11 }, (_, index) => ({ ...validQuotes[0]!, id: `q${index}` }))), 422, 'INVALID_VALUE');
    expectIssueError(() => assertFirstPublicationComplete(validBook, validNote, [{ ...validQuotes[0]!, text: '  ' }]), 422, 'INVALID_VALUE');
  });

  it('preserves supplied text and does not impose first-publication completeness during ordinary parsing', () => {
    const longNote = ' '.repeat(40);
    expect(parseIssueCreateInput({ id: 'issue-1', bookId: 'book-1', editorNote: longNote, quotes: [{ ...validQuotes[0]!, text: '  ' }] }))
      .toEqual({ id: 'issue-1', bookId: 'book-1', editorNote: longNote, quotes: [{ ...validQuotes[0]!, text: '  ' }] });
  });
});

describe('admin issue lifecycle transitions', () => {
  it.each([
    ['draft', 'publish', 'published'],
    ['published', 'withdraw', 'withdrawn'],
    ['withdrawn', 'restore', 'published'],
  ] as const)('%s → %s → %s', (from, action, to) => {
    expect(assertIssueTransition(from, action)).toBe(to);
  });

  it.each([
    ['draft', 'withdraw'],
    ['draft', 'restore'],
    ['published', 'publish'],
    ['published', 'restore'],
    ['withdrawn', 'publish'],
    ['withdrawn', 'withdraw'],
  ] as const)('rejects %s → %s', (from, action) => {
    expectIssueError(() => assertIssueTransition(from, action), 409, 'INVALID_STATE');
  });

  it('accepts only one strong composite Issue tag with safe positive versions', () => {
    const valid='"i:WyJpc3N1ZSIsImJvb2siXQ-0000000000000001-0000000000000002"';
    expect(issueIfMatch(new Headers({ 'If-Match': valid }))).toBe(valid);
    for(const value of [undefined,'*','W/'+valid,`${valid}, ${valid}`,'"i:bad-0000000000000000-0000000000000002"','"i:bad-9007199254740992-0000000000000002"']){
      const headers=new Headers();if(value!==undefined)headers.set('If-Match',value);
      const status=value===undefined?428:400;
      expectIssueError(()=>issueIfMatch(headers),status,value===undefined?'PRECONDITION_REQUIRED':'INVALID_IF_MATCH');
    }
  });
});
