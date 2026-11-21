export interface Book {
  id: string; title: string; author: string; category: string;
  year: number | null; pages: number | null; rating: number | null;
  description: string; coverTitle: string; coverAuthor: string;
  coverUrl: string | null; alt: string | null;
  version: number; createdAt: string; updatedAt: string;
}
export interface Quote { id: string; issueId: string; text: string; sourceLabel: string; position: number }
export interface PublicIssue {
  id: string; bookId: string; status: 'published';
  publicationDate: string; issueNumber: number;
  editorNote: string | null; body: string;
  version: number; createdAt: string; updatedAt: string;
  book: Book; quotes: Quote[];
}
export type IssueLookup = { kind: 'published'; issue: PublicIssue } | { kind: 'not-found' } | { kind: 'withdrawn' };
export interface IssuePage { items: PublicIssue[]; nextCursor: string | null }
