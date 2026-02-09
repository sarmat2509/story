-- Migration: Fix scene 1 trailing word for story 502c5782-7130-45ce-ac6a-732231798710
-- The LLM generated scene 1 text ending with "Емілія" which belongs to scene 2.
-- This migration moves the word from scene 1 end to scene 2 start.
-- Created: 2026-02-08

-- Step 1: Verify current state (for logging by runMigration)
DO $$
DECLARE
  story_id_val UUID := '502c5782-7130-45ce-ac6a-732231798710';
  scene1_text TEXT;
  scene2_text TEXT;
  scene1_new TEXT;
  scene2_new TEXT;
  full_text_new TEXT;
  scene_count INT;
BEGIN
  -- Get current scene texts from JSONB
  SELECT
    scenes->0->>'text',
    scenes->1->>'text',
    jsonb_array_length(scenes)
  INTO scene1_text, scene2_text, scene_count
  FROM stories
  WHERE id = story_id_val;

  IF scene1_text IS NULL THEN
    RAISE NOTICE 'Story % not found or has no scenes', story_id_val;
    RETURN;
  END IF;

  RAISE NOTICE 'Scene count: %', scene_count;
  RAISE NOTICE 'Scene 1 last 80 chars: %', RIGHT(scene1_text, 80);
  RAISE NOTICE 'Scene 2 first 80 chars: %', LEFT(scene2_text, 80);

  -- Check if scene 1 ends with the dangling word
  IF scene1_text NOT LIKE '%Емілія' THEN
    RAISE NOTICE 'Scene 1 does NOT end with "Емілія" — no fix needed';
    RETURN;
  END IF;

  -- Remove trailing "Емілія" from scene 1 (and any preceding whitespace after last period/punctuation)
  -- Pattern: text ends with some whitespace or nothing, then "Емілія"
  scene1_new := regexp_replace(scene1_text, '\s*Емілія$', '');

  -- Prepend "Емілія" to scene 2 if it doesn't already start with it
  IF scene2_text LIKE 'Емілія%' THEN
    scene2_new := scene2_text; -- Already starts with the word
  ELSE
    scene2_new := 'Емілія' || scene2_text; -- No space needed if scene2 starts with space
    -- If scene2 doesn't start with space, add one
    IF LEFT(scene2_text, 1) != ' ' THEN
      scene2_new := 'Емілія ' || scene2_text;
    END IF;
  END IF;

  RAISE NOTICE 'Scene 1 new last 80 chars: %', RIGHT(scene1_new, 80);
  RAISE NOTICE 'Scene 2 new first 80 chars: %', LEFT(scene2_new, 80);

  -- Step 2: Update stories.scenes JSONB (scene 1 = index 0, scene 2 = index 1)
  UPDATE stories
  SET
    scenes = jsonb_set(
      jsonb_set(scenes, '{0,text}', to_jsonb(scene1_new)),
      '{1,text}', to_jsonb(scene2_new)
    )
  WHERE id = story_id_val;

  -- Step 3: Recompute full_text from all scene texts
  SELECT string_agg(scene_elem->>'text', E'\n\n' ORDER BY ord)
  INTO full_text_new
  FROM stories,
       jsonb_array_elements(scenes) WITH ORDINALITY AS t(scene_elem, ord)
  WHERE id = story_id_val;

  UPDATE stories
  SET full_text = full_text_new
  WHERE id = story_id_val;

  -- Step 4: Update scenes table rows if they exist
  UPDATE scenes
  SET text = scene1_new
  WHERE story_id = story_id_val AND scene_id = 1;

  UPDATE scenes
  SET text = scene2_new
  WHERE story_id = story_id_val AND scene_id = 2;

  RAISE NOTICE 'Fix applied successfully for story %', story_id_val;
END $$;
