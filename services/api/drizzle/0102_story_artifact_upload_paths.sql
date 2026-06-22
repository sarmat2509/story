UPDATE story_artifacts
SET image_path = regexp_replace(image_path, '^output/story-artifacts/', 'story-artifacts/')
WHERE image_path LIKE 'output/story-artifacts/%';
