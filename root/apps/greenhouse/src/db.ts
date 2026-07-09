import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { createDb } from "@lodekit/sdk";

export const plants = sqliteTable("plants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  species: text("species").notNull(),
  icon: text("icon").notNull(),
  personality: text("personality").notNull().default(""),
  adoptedAt: integer("adopted_at").notNull(), // epoch ms
});

export const careRules = sqliteTable(
  "care_rules",
  {
    plantId: integer("plant_id").notNull().references(() => plants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // water | feed | mist
    every: text("every").notNull(), // "3d" / "12h"
  },
  (t) => [primaryKey({ columns: [t.plantId, t.kind] })]
);

export const careState = sqliteTable(
  "care_state",
  {
    plantId: integer("plant_id").notNull().references(() => plants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    lastAt: integer("last_at").notNull(),
    dueAt: integer("due_at").notNull(),
    dueSince: integer("due_since"),
    reminderRunId: integer("reminder_run_id"),
  },
  (t) => [primaryKey({ columns: [t.plantId, t.kind] })]
);

export const journal = sqliteTable(
  "journal",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    plantId: integer("plant_id").notNull().references(() => plants.id, { onDelete: "cascade" }),
    at: integer("at").notNull(),
    kind: text("kind"), // the care kind when the entry records care; null for notes
    text: text("text").notNull(),
  },
  (t) => [index("journal_plant_at").on(t.plantId, t.at)]
);

export const db = createDb({ plants, careRules, careState, journal });

export type Plant = typeof plants.$inferSelect;
export type CareStateRow = typeof careState.$inferSelect;
