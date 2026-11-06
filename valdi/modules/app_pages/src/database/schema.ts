import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const submission = sqliteTable('submission', {
  id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
  summary: text('summary').notNull(),
  createdAt: integer('created_at').notNull(),
});
