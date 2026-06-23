ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS cover_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stories_cover_asset_id_idx
  ON stories(cover_asset_id);

COMMENT ON COLUMN stories.cover_asset_id IS
  'Canonical approved cover image asset for story cards, share cards, and map/story references.';

DO $$
DECLARE
  has_share_card_scene_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'stories'
      AND column_name = 'share_card_scene_id'
  )
  INTO has_share_card_scene_id;

  IF has_share_card_scene_id THEN
    EXECUTE $backfill$
      WITH ordered_scenes AS (
        SELECT
          sc.id AS scene_db_id,
          sc.story_id,
          sc.image_url,
          row_number() OVER (PARTITION BY sc.story_id ORDER BY sc.scene_id) - 1 AS scene_index,
          row_number() OVER (
            PARTITION BY sc.story_id
            ORDER BY CASE WHEN sc.image_url IS NULL OR sc.image_url = '' THEN 1 ELSE 0 END, sc.scene_id
          ) AS first_image_rank
        FROM scenes sc
      ),
      preferred_scene AS (
        SELECT DISTINCT ON (st.id)
          st.id AS story_id,
          os.scene_db_id,
          os.image_url
        FROM stories st
        JOIN ordered_scenes os
          ON os.story_id = st.id
         AND os.image_url IS NOT NULL
         AND os.image_url <> ''
        WHERE st.cover_asset_id IS NULL
          AND (
            os.scene_index = COALESCE(st.share_card_scene_id, -1)
            OR (st.share_card_scene_id IS NULL AND os.first_image_rank = 1)
          )
        ORDER BY
          st.id,
          CASE WHEN os.scene_index = COALESCE(st.share_card_scene_id, -1) THEN 0 ELSE 1 END,
          os.first_image_rank
      ),
      fallback_scene AS (
        SELECT DISTINCT ON (st.id)
          st.id AS story_id,
          os.scene_db_id,
          os.image_url
        FROM stories st
        JOIN ordered_scenes os
          ON os.story_id = st.id
         AND os.image_url IS NOT NULL
         AND os.image_url <> ''
        WHERE st.cover_asset_id IS NULL
        ORDER BY st.id, os.first_image_rank
      ),
      resolved_scene AS (
        SELECT
          COALESCE(ps.story_id, fs.story_id) AS story_id,
          COALESCE(ps.scene_db_id, fs.scene_db_id) AS scene_db_id,
          COALESCE(ps.image_url, fs.image_url) AS image_url
        FROM fallback_scene fs
        FULL JOIN preferred_scene ps ON ps.story_id = fs.story_id
      ),
      resolved_asset AS (
        SELECT DISTINCT ON (rs.story_id)
          rs.story_id,
          a.id AS asset_id
        FROM resolved_scene rs
        JOIN assets a
          ON a.story_id = rs.story_id
         AND a.scene_id = rs.scene_db_id
         AND a.storage_path = rs.image_url
         AND a.asset_type = 'image'
         AND a.status = 'completed'
        ORDER BY rs.story_id, a.created_at DESC
      )
      UPDATE stories st
      SET cover_asset_id = ra.asset_id
      FROM resolved_asset ra
      WHERE st.id = ra.story_id
        AND st.cover_asset_id IS NULL;
    $backfill$;
  ELSE
    EXECUTE $backfill$
      WITH ordered_scenes AS (
        SELECT
          sc.id AS scene_db_id,
          sc.story_id,
          sc.image_url,
          row_number() OVER (
            PARTITION BY sc.story_id
            ORDER BY CASE WHEN sc.image_url IS NULL OR sc.image_url = '' THEN 1 ELSE 0 END, sc.scene_id
          ) AS first_image_rank
        FROM scenes sc
      ),
      fallback_scene AS (
        SELECT DISTINCT ON (st.id)
          st.id AS story_id,
          os.scene_db_id,
          os.image_url
        FROM stories st
        JOIN ordered_scenes os
          ON os.story_id = st.id
         AND os.image_url IS NOT NULL
         AND os.image_url <> ''
        WHERE st.cover_asset_id IS NULL
        ORDER BY st.id, os.first_image_rank
      ),
      resolved_asset AS (
        SELECT DISTINCT ON (fs.story_id)
          fs.story_id,
          a.id AS asset_id
        FROM fallback_scene fs
        JOIN assets a
          ON a.story_id = fs.story_id
         AND a.scene_id = fs.scene_db_id
         AND a.storage_path = fs.image_url
         AND a.asset_type = 'image'
         AND a.status = 'completed'
        ORDER BY fs.story_id, a.created_at DESC
      )
      UPDATE stories st
      SET cover_asset_id = ra.asset_id
      FROM resolved_asset ra
      WHERE st.id = ra.story_id
        AND st.cover_asset_id IS NULL;
    $backfill$;
  END IF;
END $$;

ALTER TABLE stories
  DROP COLUMN IF EXISTS share_card_scene_id;
