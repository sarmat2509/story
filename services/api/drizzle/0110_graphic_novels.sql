-- Graphic novels: page/panel persistence and a separate configurable page count.

CREATE TABLE IF NOT EXISTS graphic_novel_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  story_request_id uuid REFERENCES story_requests(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language varchar(5) NOT NULL,
  age_group varchar(10) NOT NULL,
  page_count integer NOT NULL DEFAULT 8,
  status varchar(20) NOT NULL DEFAULT 'generating',
  script_json jsonb NOT NULL,
  layout_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS graphic_novel_projects_story_id_idx
  ON graphic_novel_projects(story_id);
CREATE INDEX IF NOT EXISTS graphic_novel_projects_story_request_id_idx
  ON graphic_novel_projects(story_request_id);
CREATE INDEX IF NOT EXISTS graphic_novel_projects_user_id_idx
  ON graphic_novel_projects(user_id);
CREATE INDEX IF NOT EXISTS graphic_novel_projects_status_idx
  ON graphic_novel_projects(status);

CREATE TABLE IF NOT EXISTS graphic_novel_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES graphic_novel_projects(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  template_id varchar(20) NOT NULL,
  page_role varchar(40) NOT NULL,
  layout_json jsonb NOT NULL,
  bubble_layout_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  image_url text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  generation_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS graphic_novel_pages_project_id_idx
  ON graphic_novel_pages(project_id);
CREATE INDEX IF NOT EXISTS graphic_novel_pages_story_id_idx
  ON graphic_novel_pages(story_id);
CREATE UNIQUE INDEX IF NOT EXISTS graphic_novel_pages_project_page_uidx
  ON graphic_novel_pages(project_id, page_number);
CREATE INDEX IF NOT EXISTS graphic_novel_pages_status_idx
  ON graphic_novel_pages(status);
CREATE INDEX IF NOT EXISTS graphic_novel_pages_image_asset_id_idx
  ON graphic_novel_pages(image_asset_id);

CREATE TABLE IF NOT EXISTS graphic_novel_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES graphic_novel_pages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES graphic_novel_projects(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  panel_index integer NOT NULL,
  panel_id varchar(40) NOT NULL,
  speaker_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  thought_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  caption text,
  visual_action text NOT NULL,
  characters_present jsonb NOT NULL DEFAULT '[]'::jsonb,
  art_prompt text NOT NULL,
  bubble_geometry jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS graphic_novel_panels_page_id_idx
  ON graphic_novel_panels(page_id);
CREATE INDEX IF NOT EXISTS graphic_novel_panels_project_id_idx
  ON graphic_novel_panels(project_id);
CREATE INDEX IF NOT EXISTS graphic_novel_panels_story_id_idx
  ON graphic_novel_panels(story_id);
CREATE UNIQUE INDEX IF NOT EXISTS graphic_novel_panels_page_panel_uidx
  ON graphic_novel_panels(page_id, panel_index);

INSERT INTO features (slug, name, description, feature_type, default_value, category)
VALUES (
  'graphic_novel_pages_per_story',
  'Graphic novel pages per story',
  'Number of generated graphic-novel pages per story.',
  'numeric',
  '{"limit": 0}'::jsonb,
  'generation'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_type = EXCLUDED.feature_type,
  default_value = EXCLUDED.default_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO plan_features (plan_id, feature_id, value)
SELECT
  plans.id,
  features.id,
  jsonb_build_object(
    'limit',
    CASE plans.slug
      WHEN 'free' THEN 0
      ELSE 8
    END
  )
FROM plans
JOIN features ON features.slug = 'graphic_novel_pages_per_story'
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

INSERT INTO features (slug, name, description, feature_type, default_value, category)
VALUES (
  'graphic_novels_per_month',
  'Graphic novels per month',
  'Number of graphic novels available per billing period.',
  'numeric',
  '{"limit": 0}'::jsonb,
  'limits'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_type = EXCLUDED.feature_type,
  default_value = EXCLUDED.default_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO plan_features (plan_id, feature_id, value)
SELECT
  plans.id,
  features.id,
  jsonb_build_object(
    'limit',
    CASE plans.slug
      WHEN 'free' THEN 0
      WHEN 'silver' THEN 5
      WHEN 'golden' THEN 10
      WHEN 'fairyworld' THEN 15
      ELSE 0
    END
  )
FROM plans
JOIN features ON features.slug = 'graphic_novels_per_month'
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
