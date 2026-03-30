ALTER TABLE stories
ADD COLUMN IF NOT EXISTS show_on_home_page boolean DEFAULT false NOT NULL;
