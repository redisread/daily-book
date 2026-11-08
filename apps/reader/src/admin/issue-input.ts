export class IssueInputError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

export interface IssueQuoteInput {
  id: string;
  text: string;
  sourceLabel: string;
}

export interface IssueCreateInput {
  id: string;
  bookId: string;
  editorNote?: string | null;
  body?: string;
  quotes?: IssueQuoteInput[];
}

export interface IssuePatchInput {
  editorNote?: string | null;
  body?: string;
  quotes?: IssueQuoteInput[];
}

const invalidValue = () => new IssueInputError(422, 'INVALID_VALUE');
const unknownField = () => new IssueInputError(400, 'UNKNOWN_FIELD');
const invalidState = () => new IssueInputError(409, 'INVALID_STATE');

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidValue();
  return value as Record<string, unknown>;
}

function allowKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key))) throw unknownField();
}

function inputId(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) throw invalidValue();
  return value;
}

function text(value: unknown, max: number, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || [...value].length > max) throw invalidValue();
  return value;
}

function parseQuotes(value: unknown, currentIds?: ReadonlySet<string>, otherExistingIds?: ReadonlySet<string>): IssueQuoteInput[] {
  if (!Array.isArray(value) || value.length > 100) throw invalidValue();
  const seen = new Set<string>();
  return value.map(item => {
    const quote = objectValue(item);
    allowKeys(quote, ['id', 'text', 'sourceLabel']);
    if (Object.keys(quote).length !== 3) throw invalidValue();
    const id = inputId(quote.id, 160);
    if (seen.has(id) || (otherExistingIds?.has(id) && !currentIds?.has(id))) throw invalidValue();
    seen.add(id);
    return {
      id,
      text: text(quote.text, 10_000)!,
      sourceLabel: text(quote.sourceLabel, 1_000)!,
    };
  });
}

export function parseIssueCreateInput(value: unknown): IssueCreateInput {
  const input = objectValue(value);
  allowKeys(input, ['id', 'bookId', 'editorNote', 'body', 'quotes']);
  const result: IssueCreateInput = {
    id: inputId(input.id, 128),
    bookId: inputId(input.bookId, 128),
  };
  if (Object.hasOwn(input, 'editorNote')) result.editorNote = text(input.editorNote, 10_000, true);
  if (Object.hasOwn(input, 'body')) result.body = text(input.body, 100_000)!;
  if (Object.hasOwn(input, 'quotes')) result.quotes = parseQuotes(input.quotes);
  return result;
}

export function parseIssuePatchInput(value: unknown, currentQuoteIds: ReadonlySet<string>, otherExistingQuoteIds: ReadonlySet<string> = new Set()): IssuePatchInput {
  const input = objectValue(value);
  allowKeys(input, ['editorNote', 'body', 'quotes']);
  const result: IssuePatchInput = {};
  if (Object.hasOwn(input, 'editorNote')) result.editorNote = text(input.editorNote, 10_000, true);
  if (Object.hasOwn(input, 'body')) result.body = text(input.body, 100_000)!;
  if (Object.hasOwn(input, 'quotes')) result.quotes = parseQuotes(input.quotes, currentQuoteIds, otherExistingQuoteIds);
  return result;
}

export interface FirstPublicationBook {
  title: string;
  author: string;
  category: string;
  description: string;
}

export function assertFirstPublicationComplete(book: FirstPublicationBook, editorNote: string | null, quotes: readonly IssueQuoteInput[]): void {
  if ([book.title, book.author, book.category, book.description].some(value => typeof value !== 'string' || value.trim().length === 0)) throw invalidValue();
  if (editorNote === null || [...editorNote.trim()].length < 40 || [...editorNote.trim()].length > 100) throw invalidValue();
  if (quotes.length < 1 || quotes.length > 10 || quotes.some(quote => quote.text.trim().length === 0 || quote.sourceLabel.trim().length === 0)) throw invalidValue();
}

export type IssueLifecycleStatus = 'draft' | 'published' | 'withdrawn';

export function assertIssueTransition(from: IssueLifecycleStatus, action: 'publish' | 'withdraw' | 'restore'): IssueLifecycleStatus {
  if (action === 'publish' && from === 'draft') return 'published';
  if (action === 'withdraw' && from === 'published') return 'withdrawn';
  if (action === 'restore' && from === 'withdrawn') return 'published';
  throw invalidState();
}
