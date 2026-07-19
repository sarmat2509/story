-- Free-layout comic and mixed-story pages persist their complete layout in
-- layout_json. The legacy preset-template identifier was removed from the
-- Drizzle schema in 0118, but the physical NOT NULL column was left behind and
-- blocks every new page insert.

ALTER TABLE graphic_novel_pages
  DROP COLUMN IF EXISTS template_id;
