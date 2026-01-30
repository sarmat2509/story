-- ==========================================
-- Migration 0009: Add Translations Table
-- ==========================================

-- Create translations table
CREATE TABLE IF NOT EXISTS translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,  -- 'story_goal', 'story_tone', 'scenario_card'
  entity_id VARCHAR(100) NOT NULL,    -- slug or id of the entity
  locale VARCHAR(5) NOT NULL,         -- 'uk', 'ru', 'en', 'es'
  field_name VARCHAR(50) NOT NULL,    -- 'name', 'description'
  value TEXT NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  
  CONSTRAINT translations_unique UNIQUE(entity_type, entity_id, locale, field_name)
);

-- Indexes for performance
CREATE INDEX idx_translations_lookup ON translations(entity_type, entity_id, locale);
CREATE INDEX idx_translations_entity ON translations(entity_type, entity_id);
CREATE INDEX idx_translations_locale ON translations(locale);

COMMENT ON TABLE translations IS 'Centralized translations for all dictionary entities';
COMMENT ON COLUMN translations.entity_type IS 'Type of entity: story_goal, story_tone, scenario_card';
COMMENT ON COLUMN translations.entity_id IS 'Slug or ID of the entity being translated';
COMMENT ON COLUMN translations.locale IS 'ISO language code: uk, ru, en, es';
COMMENT ON COLUMN translations.field_name IS 'Field being translated: name, description';

-- ==========================================
-- Populate Story Goals Translations
-- ==========================================

-- friendship
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'friendship', 'uk', 'name', 'Дружба'),
('story_goal', 'friendship', 'uk', 'description', 'Побудова та підтримка дружніх стосунків через довіру, спілкування та взаємну підтримку'),
('story_goal', 'friendship', 'ru', 'name', 'Дружба'),
('story_goal', 'friendship', 'ru', 'description', 'Построение и поддержка дружеских отношений через доверие, общение и взаимную поддержку'),
('story_goal', 'friendship', 'en', 'name', 'Friendship'),
('story_goal', 'friendship', 'en', 'description', 'Building and maintaining friendships through trust, communication, and mutual support'),
('story_goal', 'friendship', 'es', 'name', 'Amistad'),
('story_goal', 'friendship', 'es', 'description', 'Construir y mantener amistades a través de la confianza, la comunicación y el apoyo mutuo');

-- kindness
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'kindness', 'uk', 'name', 'Доброта'),
('story_goal', 'kindness', 'uk', 'description', 'Вияви доброти та розуміння їх впливу на інших'),
('story_goal', 'kindness', 'ru', 'name', 'Доброта'),
('story_goal', 'kindness', 'ru', 'description', 'Проявления доброты и понимание их влияния на других'),
('story_goal', 'kindness', 'en', 'name', 'Kindness'),
('story_goal', 'kindness', 'en', 'description', 'Performing acts of kindness and understanding their impact on others'),
('story_goal', 'kindness', 'es', 'name', 'Bondad'),
('story_goal', 'kindness', 'es', 'description', 'Realizar actos de bondad y comprender su impacto en los demás');

-- empathy
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'empathy', 'uk', 'name', 'Емпатія'),
('story_goal', 'empathy', 'uk', 'description', 'Розуміння та співпереживання почуттів інших'),
('story_goal', 'empathy', 'ru', 'name', 'Эмпатия'),
('story_goal', 'empathy', 'ru', 'description', 'Понимание и сопереживание чувствам других'),
('story_goal', 'empathy', 'en', 'name', 'Empathy'),
('story_goal', 'empathy', 'en', 'description', 'Understanding and sharing the feelings of others'),
('story_goal', 'empathy', 'es', 'name', 'Empatía'),
('story_goal', 'empathy', 'es', 'description', 'Comprender y compartir los sentimientos de los demás');

-- help_parents
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'help_parents', 'uk', 'name', 'Допомога батькам'),
('story_goal', 'help_parents', 'uk', 'description', 'Участь у сімейних справах через відповідні віку завдання'),
('story_goal', 'help_parents', 'ru', 'name', 'Помощь родителям'),
('story_goal', 'help_parents', 'ru', 'description', 'Участие в семейных делах через соответствующие возрасту задачи'),
('story_goal', 'help_parents', 'en', 'name', 'Helping Parents'),
('story_goal', 'help_parents', 'en', 'description', 'Contributing to family through age-appropriate tasks'),
('story_goal', 'help_parents', 'es', 'name', 'Ayudar a los padres'),
('story_goal', 'help_parents', 'es', 'description', 'Contribuir a la familia mediante tareas apropiadas para la edad');

-- self_reliance
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'self_reliance', 'uk', 'name', 'Самостійність'),
('story_goal', 'self_reliance', 'uk', 'description', 'Розвиток незалежності та навичок вирішення проблем'),
('story_goal', 'self_reliance', 'ru', 'name', 'Самостоятельность'),
('story_goal', 'self_reliance', 'ru', 'description', 'Развитие независимости и навыков решения проблем'),
('story_goal', 'self_reliance', 'en', 'name', 'Self-Reliance'),
('story_goal', 'self_reliance', 'en', 'description', 'Developing independence and problem-solving skills'),
('story_goal', 'self_reliance', 'es', 'name', 'Autonomía'),
('story_goal', 'self_reliance', 'es', 'description', 'Desarrollar la independencia y las habilidades de resolución de problemas');

-- courage
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'courage', 'uk', 'name', 'Сміливість'),
('story_goal', 'courage', 'uk', 'description', 'Подолання страхів та сміливе випробування нового'),
('story_goal', 'courage', 'ru', 'name', 'Смелость'),
('story_goal', 'courage', 'ru', 'description', 'Преодоление страхов и смелое испытание нового'),
('story_goal', 'courage', 'en', 'name', 'Courage'),
('story_goal', 'courage', 'en', 'description', 'Facing fears and trying new things with bravery'),
('story_goal', 'courage', 'es', 'name', 'Valentía'),
('story_goal', 'courage', 'es', 'description', 'Enfrentar los miedos y probar cosas nuevas con valentía');

-- sharing
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'sharing', 'uk', 'name', 'Вміння ділитися'),
('story_goal', 'sharing', 'uk', 'description', 'Навчання ділитися речами, часом та увагою'),
('story_goal', 'sharing', 'ru', 'name', 'Умение делиться'),
('story_goal', 'sharing', 'ru', 'description', 'Обучение делиться вещами, временем и вниманием'),
('story_goal', 'sharing', 'en', 'name', 'Sharing'),
('story_goal', 'sharing', 'en', 'description', 'Learning to share possessions, time, and attention'),
('story_goal', 'sharing', 'es', 'name', 'Compartir'),
('story_goal', 'sharing', 'es', 'description', 'Aprender a compartir posesiones, tiempo y atención');

-- no_bullying
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'no_bullying', 'uk', 'name', 'Протистояння кривдникам'),
('story_goal', 'no_bullying', 'uk', 'description', 'Розпізнавання недоброзичливої поведінки та відповідна реакція'),
('story_goal', 'no_bullying', 'ru', 'name', 'Противостояние обидчикам'),
('story_goal', 'no_bullying', 'ru', 'description', 'Распознавание недоброжелательного поведения и соответствующая реакция'),
('story_goal', 'no_bullying', 'en', 'name', 'Standing Against Bullying'),
('story_goal', 'no_bullying', 'en', 'description', 'Recognizing unkind behavior and responding appropriately'),
('story_goal', 'no_bullying', 'es', 'name', 'Contra el acoso'),
('story_goal', 'no_bullying', 'es', 'description', 'Reconocer comportamientos unkind y responder apropiadamente');

-- safety_road
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'safety_road', 'uk', 'name', 'Безпека на дорозі'),
('story_goal', 'safety_road', 'uk', 'description', 'Розуміння та практика правил дорожньої безпеки'),
('story_goal', 'safety_road', 'ru', 'name', 'Безопасность на дороге'),
('story_goal', 'safety_road', 'ru', 'description', 'Понимание и практика правил дорожной безопасности'),
('story_goal', 'safety_road', 'en', 'name', 'Road Safety'),
('story_goal', 'safety_road', 'en', 'description', 'Understanding and practicing road safety rules'),
('story_goal', 'safety_road', 'es', 'name', 'Seguridad vial'),
('story_goal', 'safety_road', 'es', 'description', 'Comprender y practicar las reglas de seguridad vial');

-- safety_water
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'safety_water', 'uk', 'name', 'Безпека на воді'),
('story_goal', 'safety_water', 'uk', 'description', 'Розуміння правил безпеки на воді та плавання'),
('story_goal', 'safety_water', 'ru', 'name', 'Безопасность на воде'),
('story_goal', 'safety_water', 'ru', 'description', 'Понимание правил безопасности на воде и плавания'),
('story_goal', 'safety_water', 'en', 'name', 'Water Safety'),
('story_goal', 'safety_water', 'en', 'description', 'Understanding water safety and swimming rules'),
('story_goal', 'safety_water', 'es', 'name', 'Seguridad acuática'),
('story_goal', 'safety_water', 'es', 'description', 'Comprender la seguridad en el agua y las reglas de natación');

-- safety_strangers
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'safety_strangers', 'uk', 'name', 'Безпека з незнайомцями'),
('story_goal', 'safety_strangers', 'uk', 'description', 'Розуміння безпечної взаємодії з незнайомими людьми'),
('story_goal', 'safety_strangers', 'ru', 'name', 'Безопасность с незнакомцами'),
('story_goal', 'safety_strangers', 'ru', 'description', 'Понимание безопасного взаимодействия с незнакомыми людьми'),
('story_goal', 'safety_strangers', 'en', 'name', 'Stranger Safety'),
('story_goal', 'safety_strangers', 'en', 'description', 'Understanding safe interactions with unfamiliar people'),
('story_goal', 'safety_strangers', 'es', 'name', 'Seguridad con extraños'),
('story_goal', 'safety_strangers', 'es', 'description', 'Comprender las interacciones seguras con personas desconocidas');

-- ==========================================
-- Populate Story Tones Translations
-- ==========================================

-- calm
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_tone', 'calm', 'uk', 'name', 'Спокійна і заспокійлива'),
('story_tone', 'calm', 'uk', 'description', 'Ніжна, мирна розповідь ідеальна для сну'),
('story_tone', 'calm', 'ru', 'name', 'Спокойная и успокаивающая'),
('story_tone', 'calm', 'ru', 'description', 'Нежное, мирное повествование идеально для сна'),
('story_tone', 'calm', 'en', 'name', 'Calm & Soothing'),
('story_tone', 'calm', 'en', 'description', 'Gentle, peaceful narrative perfect for bedtime'),
('story_tone', 'calm', 'es', 'name', 'Calmante y relajante'),
('story_tone', 'calm', 'es', 'description', 'Narrativa suave y pacífica perfecta para dormir');

-- adventure
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_tone', 'adventure', 'uk', 'name', 'Пригодницька'),
('story_tone', 'adventure', 'uk', 'description', 'Захоплююча подорож або квест з викликами'),
('story_tone', 'adventure', 'ru', 'name', 'Приключенческая'),
('story_tone', 'adventure', 'ru', 'description', 'Захватывающее путешествие или квест с вызовами'),
('story_tone', 'adventure', 'en', 'name', 'Adventure'),
('story_tone', 'adventure', 'en', 'description', 'Exciting journey or quest with challenges to overcome'),
('story_tone', 'adventure', 'es', 'name', 'Aventura'),
('story_tone', 'adventure', 'es', 'description', 'Viaje emocionante o búsqueda con desafíos que superar');

-- humor
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_tone', 'humor', 'uk', 'name', 'Гумористична'),
('story_tone', 'humor', 'uk', 'description', 'Веселі ситуації, кумедні персонажі та ігрові моменти'),
('story_tone', 'humor', 'ru', 'name', 'Юмористическая'),
('story_tone', 'humor', 'ru', 'description', 'Веселые ситуации, забавные персонажи и игровые моменты'),
('story_tone', 'humor', 'en', 'name', 'Humorous'),
('story_tone', 'humor', 'en', 'description', 'Funny situations, silly characters, and playful moments'),
('story_tone', 'humor', 'es', 'name', 'Humorística'),
('story_tone', 'humor', 'es', 'description', 'Situaciones divertidas, personajes tontos y momentos juguetones');

-- lullaby
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_tone', 'lullaby', 'uk', 'name', 'Колискова'),
('story_tone', 'lullaby', 'uk', 'description', 'Ритмічна, заспокійлива розповідь для сну'),
('story_tone', 'lullaby', 'ru', 'name', 'Колыбельная'),
('story_tone', 'lullaby', 'ru', 'description', 'Ритмичное, успокаивающее повествование для сна'),
('story_tone', 'lullaby', 'en', 'name', 'Lullaby'),
('story_tone', 'lullaby', 'en', 'description', 'Rhythmic, soothing narrative designed to induce sleep'),
('story_tone', 'lullaby', 'es', 'name', 'Canción de cuna'),
('story_tone', 'lullaby', 'es', 'description', 'Narrativa rítmica y relajante diseñada para inducir el sueño');

-- educational
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_tone', 'educational', 'uk', 'name', 'Навчальна'),
('story_tone', 'educational', 'uk', 'description', 'Навчання конкретним концепціям або навичкам через історію'),
('story_tone', 'educational', 'ru', 'name', 'Обучающая'),
('story_tone', 'educational', 'ru', 'description', 'Обучение конкретным концепциям или навыкам через историю'),
('story_tone', 'educational', 'en', 'name', 'Educational'),
('story_tone', 'educational', 'en', 'description', 'Teaching specific concepts or skills through story'),
('story_tone', 'educational', 'es', 'name', 'Educativa'),
('story_tone', 'educational', 'es', 'description', 'Enseñar conceptos o habilidades específicas a través de la historia');

-- ==========================================
-- Populate Scenario Cards Translations
-- ==========================================

-- lost_toy_find_with_friend
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'lost_toy_find_with_friend', 'uk', 'name', 'Загублена іграшка'),
('scenario_card', 'lost_toy_find_with_friend', 'uk', 'description', 'Знайти улюблену іграшку з другом'),
('scenario_card', 'lost_toy_find_with_friend', 'ru', 'name', 'Потерянная игрушка'),
('scenario_card', 'lost_toy_find_with_friend', 'ru', 'description', 'Найти любимую игрушку с другом'),
('scenario_card', 'lost_toy_find_with_friend', 'en', 'name', 'Lost Toy'),
('scenario_card', 'lost_toy_find_with_friend', 'en', 'description', 'Find favorite toy with a friend'),
('scenario_card', 'lost_toy_find_with_friend', 'es', 'name', 'Juguete perdido'),
('scenario_card', 'lost_toy_find_with_friend', 'es', 'description', 'Encontrar el juguete favorito con un amigo');

-- first_day_at_school
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'first_day_at_school', 'uk', 'name', 'Перший день у школі'),
('scenario_card', 'first_day_at_school', 'uk', 'description', 'Перший день у новій школі або садочку'),
('scenario_card', 'first_day_at_school', 'ru', 'name', 'Первый день в школе'),
('scenario_card', 'first_day_at_school', 'ru', 'description', 'Первый день в новой школе или детском саду'),
('scenario_card', 'first_day_at_school', 'en', 'name', 'First Day at School'),
('scenario_card', 'first_day_at_school', 'en', 'description', 'First day at new school or kindergarten'),
('scenario_card', 'first_day_at_school', 'es', 'name', 'Primer día de escuela'),
('scenario_card', 'first_day_at_school', 'es', 'description', 'Primer día en la escuela nueva o guardería');

-- helping_parent_cook
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'helping_parent_cook', 'uk', 'name', 'Допомога на кухні'),
('scenario_card', 'helping_parent_cook', 'uk', 'description', 'Допомога батькам готувати їжу'),
('scenario_card', 'helping_parent_cook', 'ru', 'name', 'Помощь на кухне'),
('scenario_card', 'helping_parent_cook', 'ru', 'description', 'Помощь родителям готовить еду'),
('scenario_card', 'helping_parent_cook', 'en', 'name', 'Helping in the Kitchen'),
('scenario_card', 'helping_parent_cook', 'en', 'description', 'Helping parents cook a meal'),
('scenario_card', 'helping_parent_cook', 'es', 'name', 'Ayudando en la cocina'),
('scenario_card', 'helping_parent_cook', 'es', 'description', 'Ayudar a los padres a cocinar una comida');

-- afraid_of_dark
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'afraid_of_dark', 'uk', 'name', 'Страх темряви'),
('scenario_card', 'afraid_of_dark', 'uk', 'description', 'Подолання страху темряви'),
('scenario_card', 'afraid_of_dark', 'ru', 'name', 'Страх темноты'),
('scenario_card', 'afraid_of_dark', 'ru', 'description', 'Преодоление страха темноты'),
('scenario_card', 'afraid_of_dark', 'en', 'name', 'Afraid of the Dark'),
('scenario_card', 'afraid_of_dark', 'en', 'description', 'Overcoming fear of darkness'),
('scenario_card', 'afraid_of_dark', 'es', 'name', 'Miedo a la oscuridad'),
('scenario_card', 'afraid_of_dark', 'es', 'description', 'Superar el miedo a la oscuridad');

-- sharing_with_sibling
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'sharing_with_sibling', 'uk', 'name', 'Ділення з братом чи сестрою'),
('scenario_card', 'sharing_with_sibling', 'uk', 'description', 'Навчитися ділитися з братом або сестрою'),
('scenario_card', 'sharing_with_sibling', 'ru', 'name', 'Деление с братом или сестрой'),
('scenario_card', 'sharing_with_sibling', 'ru', 'description', 'Научиться делиться с братом или сестрой'),
('scenario_card', 'sharing_with_sibling', 'en', 'name', 'Sharing with Sibling'),
('scenario_card', 'sharing_with_sibling', 'en', 'description', 'Learning to share with brother or sister'),
('scenario_card', 'sharing_with_sibling', 'es', 'name', 'Compartir con hermanos'),
('scenario_card', 'sharing_with_sibling', 'es', 'description', 'Aprender a compartir con hermano o hermana');

-- new_pet_arrives
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'new_pet_arrives', 'uk', 'name', 'Новий вихованець'),
('scenario_card', 'new_pet_arrives', 'uk', 'description', 'Поява нового домашнього улюбленця'),
('scenario_card', 'new_pet_arrives', 'ru', 'name', 'Новый питомец'),
('scenario_card', 'new_pet_arrives', 'ru', 'description', 'Появление нового домашнего питомца'),
('scenario_card', 'new_pet_arrives', 'en', 'name', 'New Pet Arrives'),
('scenario_card', 'new_pet_arrives', 'en', 'description', 'A new pet joins the family'),
('scenario_card', 'new_pet_arrives', 'es', 'name', 'Nueva mascota'),
('scenario_card', 'new_pet_arrives', 'es', 'description', 'Una nueva mascota se une a la familia');

-- grandparents_visit
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'grandparents_visit', 'uk', 'name', 'Візит бабусі та дідуся'),
('scenario_card', 'grandparents_visit', 'uk', 'description', 'Бабуся та дідусь приїжджають у гості'),
('scenario_card', 'grandparents_visit', 'ru', 'name', 'Визит бабушки и дедушки'),
('scenario_card', 'grandparents_visit', 'ru', 'description', 'Бабушка и дедушка приезжают в гости'),
('scenario_card', 'grandparents_visit', 'en', 'name', 'Grandparents Visit'),
('scenario_card', 'grandparents_visit', 'en', 'description', 'Grandparents come to visit'),
('scenario_card', 'grandparents_visit', 'es', 'name', 'Visita de los abuelos'),
('scenario_card', 'grandparents_visit', 'es', 'description', 'Los abuelos vienen de visita');

-- standing_up_bully
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'standing_up_bully', 'uk', 'name', 'Протистояння кривднику'),
('scenario_card', 'standing_up_bully', 'uk', 'description', 'Постояти за себе або друга'),
('scenario_card', 'standing_up_bully', 'ru', 'name', 'Противостояние обидчику'),
('scenario_card', 'standing_up_bully', 'ru', 'description', 'Постоять за себя или друга'),
('scenario_card', 'standing_up_bully', 'en', 'name', 'Standing Up to a Bully'),
('scenario_card', 'standing_up_bully', 'en', 'description', 'Standing up for yourself or a friend'),
('scenario_card', 'standing_up_bully', 'es', 'name', 'Enfrentarse a un acosador'),
('scenario_card', 'standing_up_bully', 'es', 'description', 'Defender a ti mismo o a un amigo');

-- learning_road_safety
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'learning_road_safety', 'uk', 'name', 'Правила дорожнього руху'),
('scenario_card', 'learning_road_safety', 'uk', 'description', 'Навчитися безпечно переходити дорогу'),
('scenario_card', 'learning_road_safety', 'ru', 'name', 'Правила дорожного движения'),
('scenario_card', 'learning_road_safety', 'ru', 'description', 'Научиться безопасно переходить дорогу'),
('scenario_card', 'learning_road_safety', 'en', 'name', 'Learning Road Safety'),
('scenario_card', 'learning_road_safety', 'en', 'description', 'Learning to cross the street safely'),
('scenario_card', 'learning_road_safety', 'es', 'name', 'Aprendiendo seguridad vial'),
('scenario_card', 'learning_road_safety', 'es', 'description', 'Aprender a cruzar la calle de forma segura');

-- swimming_lesson
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'swimming_lesson', 'uk', 'name', 'Урок плавання'),
('scenario_card', 'swimming_lesson', 'uk', 'description', 'Перший урок плавання або безпека на воді'),
('scenario_card', 'swimming_lesson', 'ru', 'name', 'Урок плавания'),
('scenario_card', 'swimming_lesson', 'ru', 'description', 'Первый урок плавания или безопасность на воде'),
('scenario_card', 'swimming_lesson', 'en', 'name', 'Swimming Lesson'),
('scenario_card', 'swimming_lesson', 'en', 'description', 'First swimming lesson or water safety'),
('scenario_card', 'swimming_lesson', 'es', 'name', 'Lección de natación'),
('scenario_card', 'swimming_lesson', 'es', 'description', 'Primera lección de natación o seguridad en el agua');

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_translations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER translations_updated_at_trigger
BEFORE UPDATE ON translations
FOR EACH ROW
EXECUTE FUNCTION update_translations_updated_at();
