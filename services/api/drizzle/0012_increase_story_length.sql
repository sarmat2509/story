-- Increase story length by 1.5x for all age groups
-- Scene count and word ranges updated

UPDATE age_engine_rules SET
  scene_count = 5,  -- was 3, rounded up
  word_range_min = 150,  -- was 100
  word_range_max = 300   -- was 200
WHERE age_group = '0-1';

UPDATE age_engine_rules SET
  scene_count = 5,  -- was 3, rounded up
  word_range_min = 225,  -- was 150
  word_range_max = 375   -- was 250
WHERE age_group = '1y';

UPDATE age_engine_rules SET
  scene_count = 6,  -- was 4
  word_range_min = 300,  -- was 200
  word_range_max = 525   -- was 350
WHERE age_group = '2-3';

UPDATE age_engine_rules SET
  scene_count = 8,  -- was 5, rounded up
  word_range_min = 450,  -- was 300
  word_range_max = 750   -- was 500
WHERE age_group = '4-5';

UPDATE age_engine_rules SET
  scene_count = 9,  -- was 6
  word_range_min = 750,  -- was 500
  word_range_max = 1200  -- was 800
WHERE age_group = '6-8';

UPDATE age_engine_rules SET
  scene_count = 11, -- was 7, rounded up
  word_range_min = 1200,  -- was 800
  word_range_max = 1800   -- was 1200
WHERE age_group = '9-12';
