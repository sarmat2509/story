-- ==========================================
-- MILESTONE 3: AI STORY GENERATION ENGINE
-- ==========================================
-- This migration adds:
-- 1. Reference tables: story_goals, story_tones, content_policy_rules, age_engine_rules, scenario_cards
-- 2. Story tables: story_requests, stories, story_characters
-- 3. Comprehensive seed data for all reference tables

-- ==========================================
-- REFERENCE/CONFIGURATION TABLES WITH SEED DATA
-- ==========================================

-- Story Goals
CREATE TABLE IF NOT EXISTS story_goals (
  slug VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  prompt_guidance TEXT NOT NULL,
  min_age INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO story_goals (slug, name, description, prompt_guidance, min_age, sort_order) VALUES
('friendship', 'Friendship', 'Building and maintaining friendships through trust, communication, and mutual support', 'Show characters working through disagreements peacefully, learning to understand each other''s feelings, and supporting each other. Emphasize communication and empathy.', 2, 1),
('kindness', 'Kindness', 'Performing acts of kindness and understanding their impact on others', 'Demonstrate small acts of kindness (sharing, helping, comforting) and show positive emotional responses from recipients. Connect actions to feelings.', 0, 2),
('empathy', 'Empathy', 'Understanding and sharing the feelings of others', 'Show character recognizing another''s emotions, asking questions, and responding with care. Use phrases like "how do you feel?" and "I understand".', 4, 3),
('help_parents', 'Helping Parents', 'Contributing to family through age-appropriate tasks', 'Show child helping with simple household tasks appropriate for age. Parents express appreciation. Child feels proud and capable.', 2, 4),
('self_reliance', 'Self-Reliance', 'Developing independence and problem-solving skills', 'Child faces age-appropriate challenge, tries solutions, may ask for help when needed. Balance independence with knowing when to ask for support.', 4, 5),
('courage', 'Courage', 'Facing fears and trying new things with bravery', 'Character feels nervous about something new/challenging, gathers courage (perhaps with support), tries despite fear, and feels proud. Never minimize the fear.', 4, 6),
('sharing', 'Sharing', 'Learning to share possessions, time, and attention', 'Show initial reluctance to share, then positive experience of sharing (playing together is more fun, friend is happy). Both children benefit.', 2, 7),
('no_bullying', 'Standing Against Bullying', 'Recognizing unkind behavior and responding appropriately', 'Show unkind behavior, character feels bad, speaks up or tells adult, situation resolved. Emphasize: tell adults, be kind, everyone deserves respect.', 6, 8),
('safety_road', 'Road Safety', 'Understanding and practicing road safety rules', 'Teach: stop at curb, look both ways, hold adult''s hand, cross at crosswalk. Character follows rules and stays safe. ALWAYS with adult supervision.', 4, 9),
('safety_water', 'Water Safety', 'Understanding water safety and swimming rules', 'Teach: swim with adult present, life jacket, no running near pool, listen to lifeguard. Character follows rules. ALWAYS adult supervision.', 4, 10),
('safety_strangers', 'Stranger Safety', 'Understanding safe interactions with unfamiliar people', 'Teach: don''t go with strangers, don''t open door, tell trusted adult if uncomfortable. Emphasize trusted adults (parents, teachers) are always available.', 6, 11);

-- Story Tones
CREATE TABLE IF NOT EXISTS story_tones (
  slug VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  prompt_guidance TEXT NOT NULL,
  writing_style TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO story_tones (slug, name, description, prompt_guidance, writing_style, sort_order) VALUES
('calm', 'Calm & Soothing', 'Gentle, peaceful narrative perfect for bedtime', 'Use slow pacing, gentle language, soft imagery (moonlight, stars, quiet sounds). Build toward relaxation and sleep. Repetitive phrases create rhythm.', '{"pacing": "slow", "emotionalIntensity": "low", "sensoryFocus": "soft sounds, gentle touches, warm feelings", "sentenceRhythm": "flowing, repetitive"}', 1),
('adventure', 'Adventure', 'Exciting journey or quest with challenges to overcome', 'Moderate pacing with peaks and valleys. Character explores new places, faces challenges, overcomes obstacles. Maintain sense of safety even in exciting moments.', '{"pacing": "moderate-fast", "emotionalIntensity": "medium-high", "sensoryFocus": "vivid settings, action verbs, discovery", "sentenceRhythm": "varied, dynamic"}', 2),
('humor', 'Humorous', 'Funny situations, silly characters, and playful moments', 'Use age-appropriate humor: silly sounds, funny mishaps (not hurtful), playful wordplay, exaggeration. Physical comedy should be safe and fun, not painful.', '{"pacing": "bouncy", "emotionalIntensity": "light-medium", "sensoryFocus": "funny sounds, silly movements, surprising twists", "sentenceRhythm": "short, punchy, surprise endings"}', 3),
('lullaby', 'Lullaby', 'Rhythmic, soothing narrative designed to induce sleep', 'Very slow pacing. Strong rhythm and repetition. Gentle imagery of night, safety, comfort. Progressive relaxation. End with sleep/rest. Use musical language.', '{"pacing": "very slow", "emotionalIntensity": "very low", "sensoryFocus": "rhythmic sounds, darkness as comfort, warmth, softness", "sentenceRhythm": "highly repetitive, musical, predictable"}', 4),
('educational', 'Educational', 'Teaching specific concepts or skills through story', 'Weave lesson naturally into narrative. Character learns by doing/experiencing. Repeat key concepts. Make learning feel like fun discovery, not lecture.', '{"pacing": "moderate", "emotionalIntensity": "medium", "sensoryFocus": "clear examples, cause-effect, practical application", "sentenceRhythm": "clear, structured, building knowledge"}', 5);

-- Content Policy Rules
CREATE TABLE IF NOT EXISTS content_policy_rules (
  id VARCHAR(50) PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  prohibited_elements TEXT NOT NULL,
  examples TEXT NOT NULL,
  prompt_guidance TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO content_policy_rules (id, category, description, prohibited_elements, examples, prompt_guidance, severity, sort_order) VALUES
('graphic_violence', 'Violence & Harm', 'Graphic violence, detailed descriptions of pain, injuries, blood', '["detailed descriptions of injuries or pain", "blood, gore, wounds", "physical punishment or abuse", "weapons used to harm", "death scenes with graphic details", "animal cruelty", "bullying with physical harm"]', '{"forbidden": ["удар кулаком в лицо", "кровь течет из раны", "сломанная нога с костями", "избиение персонажа"], "allowed": ["легкий ушиб без деталей", "персонаж упал и немного плачет", "конфликт решается словами", "магическая защита от опасности"]}', 'NEVER describe injuries, blood, or physical harm in detail. All conflicts must be resolved peacefully. Physical challenges should be magical/fantastical without realistic violence.', 'critical', 1),
('fear_inducing', 'Scary Content', 'Scary images, nightmares, panic, traumatization', '["monsters with scary appearance for young children", "darkness as threatening element", "being chased or hunted", "nightmares or sleep fears", "abandonment or being lost permanently", "death of family members", "real-world dangers without safety context"]', '{"forbidden": ["темный лес где водятся страшные чудовища", "монстр с острыми зубами гонится за ребенком", "родители пропали и не вернутся"], "allowed": ["волшебный лес где немного темно, но светят звезды", "дракон выглядит грозно, но оказывается добрым", "мама ненадолго отошла, но обязательно вернется"]}', 'Age-dependent: 0-5 avoid ALL scary elements. 6-8 allow mild suspense with quick safe resolution. 9-12 allow mystery but ALWAYS with feeling of safety and adult support.', 'critical', 2),
('sexual_content', 'Sexual & Romantic', 'Sexual content, romance, physical intimacy', '["any sexual content or innuendo", "romantic relationships beyond innocent friendship", "kissing (except family pecks)", "description of bodies in sexual context", "nudity", "pregnancy or reproduction topics for young children"]', '{"forbidden": ["поцелуй в губы", "романтическое свидание", "описание привлекательности тела"], "allowed": ["дружба между мальчиком и девочкой", "мама целует в щечку", "семейные объятия"]}', 'STRICTLY PROHIBITED for ALL ages. Focus on friendship, family love, kindness. Physical affection limited to family hugs and cheek kisses.', 'critical', 3),
('self_harm', 'Self-Harm & Mental Health', 'Self-harm, suicidal thoughts, depression', '["self-harm actions or thoughts", "suicidal ideation", "severe depression or hopelessness", "eating disorders", "self-hatred or extreme negative self-talk"]', '{"forbidden": ["не хочу больше жить", "ударил себя", "все плохо и никогда не станет лучше"], "allowed": ["персонаж грустит, но друг помогает", "ошибка исправляется с поддержкой", "учится принимать себя"]}', 'NEVER include self-harm. Sadness is OK with support and resolution. Always show path to feeling better through friendship, family, or inner strength.', 'critical', 4),
('dangerous_instructions', 'Dangerous Actions', 'Instructions for dangerous actions that child might imitate', '["playing with fire or matches", "climbing dangerous places", "touching electrical outlets", "playing near roads or water unsupervised", "taking medicine without adults", "opening door to strangers", "sharing personal information online", "using sharp objects without supervision"]', '{"forbidden": ["зажег спичку и смотрел на огонь", "перелез через перила балкона", "открыл дверь незнакомцу"], "allowed": ["попросил взрослого помочь с костром", "соблюдал правила безопасности", "позвал маму когда постучали"]}', 'IF mentioning real-world activities: ALWAYS include adult supervision and safety rules. Turn dangerous situations into teaching moments about asking adults for help.', 'high', 5),
('hate_speech', 'Hate Speech & Discrimination', 'Hate speech, discrimination based on any characteristic', '["discrimination based on race, ethnicity, nationality", "discrimination based on religion", "discrimination based on gender or sexuality", "discrimination based on disability", "stereotypes and prejudice", "hate speech or derogatory language", "exclusion based on differences"]', '{"forbidden": ["не дружи с ним, он другой", "девочки не умеют", "стереотипы по национальности"], "allowed": ["все дети разные и это прекрасно", "дружба не зависит от внешности", "каждый имеет свои таланты"]}', 'ALWAYS promote inclusivity, diversity, and acceptance. Show characters of different backgrounds as equals. Celebrate differences as strengths.', 'critical', 6),
('toxic_patterns', 'Toxic Behaviors', 'Toxic behavioral patterns: manipulation, blackmail, gaslighting', '["emotional manipulation", "gaslighting or denial of feelings", "blackmail or threats", "shaming or humiliation", "toxic positivity (denying real feelings)", "conditional love", "favoritism that hurts others", "revenge as solution"]', '{"forbidden": ["если не сделаешь, я перестану с тобой дружить", "ты слишком чувствительный, это не больно", "отомстим ему за обиду"], "allowed": ["поговорили о чувствах и поняли друг друга", "извинились и помирились", "попросили взрослого помочь решить конфликт"]}', 'Show healthy conflict resolution: communication, empathy, apologies, asking for help. NEVER show manipulation as effective. Validate all emotions as real and important.', 'high', 7),
('substance_abuse', 'Substances', 'Alcohol, drugs, smoking', '["alcohol consumption", "drug use or references", "smoking or vaping", "medicine misuse", "intoxication or altered states"]', '{"forbidden": ["выпил волшебное зелье и опьянел", "курил трубку", "принял таблетку без взрослых"], "allowed": ["выпил полезный чай", "волшебный напиток дает силы (без опьянения)", "попросил маму дать лекарство"]}', 'NEVER reference substances. Magic potions are OK if clearly fantastical and never cause intoxication-like effects.', 'critical', 8),
('inappropriate_adult_themes', 'Adult Themes', 'Themes intended only for adults', '["gambling", "financial problems or poverty stress", "political conflicts", "war or military violence", "crime and criminal activity", "divorce or family breakdown (for very young)", "death with trauma", "existential crisis"]', '{"forbidden": ["родители ссорятся и разводятся", "нет денег на еду", "война пришла в город"], "allowed": ["родители иногда не согласны, но любят друг друга", "учимся ценить то что имеем", "семья переезжает в новое место (приключение)"]}', 'Keep stories in child-appropriate world. Family conflicts (if any) should be minor and quickly resolved with love. Focus on child-scale problems and solutions.', 'medium', 9);

-- Age Engine Rules
CREATE TABLE IF NOT EXISTS age_engine_rules (
  age_group VARCHAR(10) PRIMARY KEY,
  scene_count INTEGER NOT NULL,
  word_range_min INTEGER NOT NULL,
  word_range_max INTEGER NOT NULL,
  max_sentence_length INTEGER NOT NULL,
  vocabulary VARCHAR(20) NOT NULL,
  dialog_ratio DECIMAL(3,2) NOT NULL,
  themes TEXT NOT NULL,
  fear_level INTEGER NOT NULL,
  allowed_conflicts TEXT NOT NULL,
  additional_rules TEXT NOT NULL
);

INSERT INTO age_engine_rules VALUES
('0-1', 3, 100, 200, 8, 'simple', 0.1, '["bedtime", "family", "animals"]', 0, '[]', 'Pure comfort and safety. No conflicts. Only familiar, safe elements.'),
('1y', 3, 150, 250, 10, 'simple', 0.2, '["bedtime", "family", "animals", "routines"]', 0, '["mild_separation"]', 'Very brief separation (parent returns quickly). Simple emotions: happy, sad, sleepy.'),
('2-3', 4, 200, 350, 12, 'basic', 0.3, '["friendship", "exploration", "emotions"]', 0.5, '["lost_item", "small_disagreement"]', 'Mild tension with quick resolution. No scary imagery. Lost items are always found.'),
('4-5', 5, 300, 500, 15, 'basic', 0.4, '["adventure", "problem_solving", "imagination"]', 1, '["lost_item", "disagreement", "mild_challenge"]', 'Small challenges with achievable solutions. Disagreements resolve through communication. Mild suspense is OK if resolved in same scene.'),
('6-8', 6, 500, 800, 18, 'intermediate', 0.5, '["mystery", "challenges", "teamwork", "responsibility"]', 2, '["friendship_conflict", "moral_choice", "mystery"]', 'Can include mystery, moral choices, friendship challenges. Suspense allowed but with feeling of safety. Adult support available in story.'),
('9-12', 7, 800, 1200, 20, 'advanced', 0.5, '["complex_emotions", "moral_choices", "growth"]', 3, '["moral_dilemma", "responsibility", "complex_problem"]', 'Complex problems, moral dilemmas, responsibility themes. Can have sustained tension but MUST resolve positively. Character growth through challenges.');

-- Scenario Cards
CREATE TABLE IF NOT EXISTS scenario_cards (
  id VARCHAR(100) PRIMARY KEY,
  name_key VARCHAR(100) NOT NULL,
  description_key VARCHAR(100) NOT NULL,
  icon VARCHAR(50),
  suggested_goals TEXT NOT NULL,
  age_groups TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

INSERT INTO scenario_cards (id, name_key, description_key, icon, suggested_goals, age_groups, sort_order, is_active) VALUES
('lost_toy_find_with_friend', 'scenario.lost_toy.name', 'scenario.lost_toy.description', '🧸', '["friendship", "help_parents"]', '["2-3", "4-5", "6-8"]', 1, true),
('first_day_at_school', 'scenario.first_day_school.name', 'scenario.first_day_school.description', '🎒', '["courage", "self_reliance"]', '["4-5", "6-8"]', 2, true),
('helping_parent_cook', 'scenario.helping_cook.name', 'scenario.helping_cook.description', '👨‍🍳', '["help_parents", "self_reliance"]', '["2-3", "4-5", "6-8"]', 3, true),
('afraid_of_dark', 'scenario.afraid_dark.name', 'scenario.afraid_dark.description', '🌙', '["courage"]', '["2-3", "4-5", "6-8"]', 4, true),
('sharing_with_sibling', 'scenario.sharing_sibling.name', 'scenario.sharing_sibling.description', '🤝', '["sharing", "empathy"]', '["2-3", "4-5", "6-8"]', 5, true),
('new_pet_arrives', 'scenario.new_pet.name', 'scenario.new_pet.description', '🐶', '["kindness", "empathy"]', '["2-3", "4-5", "6-8", "9-12"]', 6, true),
('grandparents_visit', 'scenario.grandparents.name', 'scenario.grandparents.description', '👵', '["kindness", "empathy"]', '["0-1", "1y", "2-3", "4-5"]', 7, true),
('standing_up_bully', 'scenario.bully.name', 'scenario.bully.description', '🛡️', '["no_bullying", "courage"]', '["6-8", "9-12"]', 8, true),
('learning_road_safety', 'scenario.road_safety.name', 'scenario.road_safety.description', '🚦', '["safety_road"]', '["4-5", "6-8"]', 9, true),
('swimming_lesson', 'scenario.swimming.name', 'scenario.swimming.description', '🏊', '["safety_water", "courage"]', '["4-5", "6-8", "9-12"]', 10, true);

-- ==========================================
-- STORY GENERATION TABLES
-- ==========================================

-- Story Requests (without FK to stories initially)
CREATE TABLE IF NOT EXISTS story_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_id UUID REFERENCES child_profiles(id) ON DELETE SET NULL,
  
  ui_locale VARCHAR(5) NOT NULL,
  story_language VARCHAR(5) NOT NULL,
  goal VARCHAR(50) REFERENCES story_goals(slug),
  tone VARCHAR(50) REFERENCES story_tones(slug),
  scenario_card_id VARCHAR(100) REFERENCES scenario_cards(id),
  user_notes TEXT,
  
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  
  story_id UUID, -- FK added after stories table exists
  
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Stories
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_id UUID REFERENCES child_profiles(id) ON DELETE SET NULL,
  story_request_id UUID REFERENCES story_requests(id) ON DELETE SET NULL,
  
  title VARCHAR(255) NOT NULL,
  language VARCHAR(5) NOT NULL,
  age_group VARCHAR(10) NOT NULL REFERENCES age_engine_rules(age_group),
  moral_theme VARCHAR(50) REFERENCES story_goals(slug),
  tone VARCHAR(50) REFERENCES story_tones(slug),
  
  outline JSONB,
  scenes JSONB NOT NULL,
  full_text TEXT NOT NULL,
  word_count INTEGER,
  estimated_read_minutes INTEGER,
  
  model_version VARCHAR(50),
  generation_time_ms INTEGER,
  policy_checks JSONB,
  
  is_published BOOLEAN DEFAULT true,
  is_favorite BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- JSONB scenes structure (prepared for M4 image generation):
-- [
--   {
--     "sceneId": 1,
--     "text": "Scene text...",
--     "visualPrompt": "Visual description for image generation",
--     "imageUrl": null,
--     "imageGeneratedAt": null
--   }
-- ]

CREATE INDEX IF NOT EXISTS stories_user_id_idx ON stories(user_id);
CREATE INDEX IF NOT EXISTS stories_child_profile_id_idx ON stories(child_profile_id);
CREATE INDEX IF NOT EXISTS stories_language_idx ON stories(language);
CREATE INDEX IF NOT EXISTS stories_age_group_idx ON stories(age_group);
CREATE INDEX IF NOT EXISTS stories_created_at_idx ON stories(created_at);

-- Add FK constraint to story_requests now that stories table exists
ALTER TABLE story_requests ADD CONSTRAINT story_requests_story_id_fkey 
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL;

-- Add indexes for story_requests
CREATE INDEX IF NOT EXISTS story_requests_user_id_idx ON story_requests(user_id);
CREATE INDEX IF NOT EXISTS story_requests_status_idx ON story_requests(status);
CREATE INDEX IF NOT EXISTS story_requests_created_at_idx ON story_requests(created_at);

-- Story Characters Junction
CREATE TABLE IF NOT EXISTS story_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  role VARCHAR(50),
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(story_id, character_id)
);

CREATE INDEX IF NOT EXISTS story_characters_story_id_idx ON story_characters(story_id);
CREATE INDEX IF NOT EXISTS story_characters_character_id_idx ON story_characters(character_id);

-- ==========================================
-- TRIGGERS
-- ==========================================

CREATE TRIGGER update_story_requests_updated_at
  BEFORE UPDATE ON story_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stories_updated_at
  BEFORE UPDATE ON stories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
