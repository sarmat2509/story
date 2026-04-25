-- Closing keepsake from writer `{label}` marker (plot rule); nullable for old rows / young-age stories.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS closing_keepsake_label varchar(500);
