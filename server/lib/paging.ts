import { z } from "zod";

/** Rows per page in long staff lists (customers, activity, older requests). */
export const PAGE_SIZE = 50;

/** Input for a page: the id to continue after (none for the first page). */
export const pageInput = z.object({ cursor: z.number().int().positive().nullish() });

/** Fetch one row more than a page: if it's there, the next page continues after the last row shown. */
export function toPage<T extends { id: number }>(rows: T[]) {
  const items = rows.slice(0, PAGE_SIZE);
  return { items, nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1].id : null };
}

/** A search term for SQL "ilike": % and _ typed by people are matched literally. */
export function likeTerm(search: string) {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
