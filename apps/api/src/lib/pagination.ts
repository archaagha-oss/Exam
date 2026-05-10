/**
 * Cursor-based pagination helpers. Cursor is the last item's id.
 * Use this on every list endpoint to cap server work.
 */
import { z } from 'zod';

export const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
});

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export function toPage<T extends { id: string }>(rows: T[], take: number): Page<T> {
  if (rows.length <= take) return { data: rows, nextCursor: null };
  const next = rows[take];
  return { data: rows.slice(0, take), nextCursor: next.id };
}

/** Build a Prisma findMany args object for cursor pagination. */
export function paginate(args: { cursor?: string; take: number }) {
  return {
    take: args.take + 1, // request one extra so we know if there's a next page
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
  };
}
