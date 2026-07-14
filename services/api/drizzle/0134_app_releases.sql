CREATE TABLE "app_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version" varchar(40),
  "release_date" date NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "published_at" timestamp with time zone,
  "content_revision" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" uuid,
  "published_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_releases_status_check" CHECK ("status" IN ('draft', 'published', 'archived')),
  CONSTRAINT "app_releases_content_revision_check" CHECK ("content_revision" > 0),
  CONSTRAINT "app_releases_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "app_releases_published_by_user_id_users_id_fk"
    FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX "app_releases_status_date_idx"
  ON "app_releases" USING btree ("status", "release_date", "created_at");
--> statement-breakpoint

CREATE TABLE "app_release_localizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "release_id" uuid NOT NULL,
  "locale" varchar(5) NOT NULL,
  "title" varchar(160) NOT NULL,
  "changes" jsonb NOT NULL,
  "email_subject" varchar(200) NOT NULL,
  "email_preheader" varchar(240) NOT NULL,
  "email_body" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_release_localizations_release_id_app_releases_id_fk"
    FOREIGN KEY ("release_id") REFERENCES "app_releases"("id") ON DELETE CASCADE,
  CONSTRAINT "app_release_localizations_locale_check"
    CHECK ("locale" IN ('uk', 'ru', 'en', 'es', 'de', 'fr', 'pl')),
  CONSTRAINT "app_release_localizations_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "app_release_localizations_email_subject_check" CHECK (length(btrim("email_subject")) > 0),
  CONSTRAINT "app_release_localizations_email_preheader_check" CHECK (length(btrim("email_preheader")) > 0),
  CONSTRAINT "app_release_localizations_changes_check"
    CHECK (jsonb_typeof("changes") = 'array' AND jsonb_array_length("changes") > 0),
  CONSTRAINT "app_release_localizations_email_body_check"
    CHECK (jsonb_typeof("email_body") = 'array' AND jsonb_array_length("email_body") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "app_release_localizations_release_locale_uidx"
  ON "app_release_localizations" USING btree ("release_id", "locale");
--> statement-breakpoint
CREATE INDEX "app_release_localizations_locale_idx"
  ON "app_release_localizations" USING btree ("locale", "release_id");
--> statement-breakpoint

CREATE TABLE "app_release_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "release_id" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "public_url" text NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "width" integer,
  "height" integer,
  "file_size" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_release_media_release_id_app_releases_id_fk"
    FOREIGN KEY ("release_id") REFERENCES "app_releases"("id") ON DELETE CASCADE,
  CONSTRAINT "app_release_media_dimensions_check"
    CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)),
  CONSTRAINT "app_release_media_file_size_check" CHECK ("file_size" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "app_release_media_storage_path_uidx"
  ON "app_release_media" USING btree ("storage_path");
--> statement-breakpoint
CREATE INDEX "app_release_media_release_id_idx"
  ON "app_release_media" USING btree ("release_id", "created_at");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION assert_app_release_has_all_locales(target_release_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  actual_locales text[];
BEGIN
  SELECT array_agg(locale::text ORDER BY locale)
    INTO actual_locales
    FROM app_release_localizations
    WHERE release_id = target_release_id;

  IF actual_locales IS DISTINCT FROM ARRAY['de', 'en', 'es', 'fr', 'pl', 'ru', 'uk']::text[] THEN
    RAISE EXCEPTION
      'App release % must contain exactly one complete localization for each system locale (de,en,es,fr,pl,ru,uk); got %',
      target_release_id,
      COALESCE(array_to_string(actual_locales, ','), 'none');
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_app_release_parent_locales()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_app_release_has_all_locales(NEW.id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_app_release_child_locales()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_release_id uuid;
BEGIN
  target_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.release_id ELSE NEW.release_id END;
  IF EXISTS (SELECT 1 FROM app_releases WHERE id = target_release_id) THEN
    PERFORM assert_app_release_has_all_locales(target_release_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "app_releases_all_locales_constraint"
AFTER INSERT OR UPDATE ON "app_releases"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_app_release_parent_locales();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "app_release_localizations_all_locales_constraint"
AFTER INSERT OR UPDATE OR DELETE ON "app_release_localizations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_app_release_child_locales();
--> statement-breakpoint

INSERT INTO "app_releases" (
  "id", "version", "release_date", "status", "published_at", "content_revision"
) VALUES
  ('a0000000-0000-4000-8000-000000000714', NULL, '2026-07-14', 'published', '2026-07-14 12:00:00+00', 1),
  ('a0000000-0000-4000-8000-000000000710', NULL, '2026-07-10', 'published', '2026-07-10 12:00:00+00', 1),
  ('a0000000-0000-4000-8000-000000000709', NULL, '2026-07-09', 'published', '2026-07-09 12:00:00+00', 1),
  ('a0000000-0000-4000-8000-000000000702', NULL, '2026-07-02', 'published', '2026-07-02 12:00:00+00', 1);
--> statement-breakpoint

INSERT INTO "app_release_localizations" (
  "release_id", "locale", "title", "changes", "email_subject", "email_preheader", "email_body"
) VALUES
-- 14 July: topics, holidays, character consistency
('a0000000-0000-4000-8000-000000000714', 'en',
 'More ways to make every story feel like yours',
 $$[
   {"id":"holidays","kind":"new","title":"Holidays and traditions","description":"Create warm stories about family celebrations, cultural traditions and special days.","appUrl":"/wizard?scenarioCardId=holidays_traditions"},
   {"id":"topics","kind":"improved","title":"Story topics are easier to explore","description":"The topic picker is clearer and more polished, so it takes less time to find the right starting point."},
   {"id":"characters","kind":"improved","title":"Familiar characters stay more consistent","description":"Selected characters now keep their recognizable appearance more reliably across story illustrations."}
 ]$$::jsonb,
 'New in WonderTales: holidays, traditions and more familiar heroes',
 'Discover a new story topic and improvements that make every adventure feel more personal.',
 $$[
   {"id":"intro","type":"paragraph","text":"We have added a new way to turn meaningful family moments into stories and made it easier to choose what your next adventure will be about."},
   {"id":"highlights","type":"list","items":["Create stories about holidays and family traditions.","Browse a clearer, more polished topic picker.","See familiar characters remain more consistent across illustrations."]},
   {"id":"cta","type":"button","label":"Create a holiday story","url":"/wizard?scenarioCardId=holidays_traditions"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000714', 'uk',
 'Ще більше способів зробити кожну казку своєю',
 $$[
   {"id":"holidays","kind":"new","title":"Свята й традиції","description":"Створюйте теплі казки про родинні свята, культурні традиції та особливі дні.","appUrl":"/wizard?scenarioCardId=holidays_traditions"},
   {"id":"topics","kind":"improved","title":"Теми казок стало легше переглядати","description":"Вибір теми став зрозумілішим і охайнішим, тож знайти вдалий початок нової пригоди тепер простіше."},
   {"id":"characters","kind":"improved","title":"Знайомі герої виглядають послідовніше","description":"Обрані персонажі тепер надійніше зберігають упізнавану зовнішність на різних ілюстраціях казки."}
 ]$$::jsonb,
 'Нове у WonderTales: свята, традиції та ще знайоміші герої',
 'Відкрийте нову тему казок і поліпшення, які роблять кожну пригоду особистішою.',
 $$[
   {"id":"intro","type":"paragraph","text":"Ми додали новий спосіб перетворювати важливі родинні моменти на казки та спростили вибір теми для наступної пригоди."},
   {"id":"highlights","type":"list","items":["Створюйте казки про свята й родинні традиції.","Користуйтеся зрозумілішим і охайнішим вибором тем.","Знайомі герої краще зберігають вигляд на різних ілюстраціях."]},
   {"id":"cta","type":"button","label":"Створити святкову казку","url":"/wizard?scenarioCardId=holidays_traditions"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000714', 'ru',
 'Ещё больше способов сделать каждую сказку своей',
 $$[
   {"id":"holidays","kind":"new","title":"Праздники и традиции","description":"Создавайте тёплые сказки о семейных праздниках, культурных традициях и особенных днях.","appUrl":"/wizard?scenarioCardId=holidays_traditions"},
   {"id":"topics","kind":"improved","title":"Темы сказок стало удобнее просматривать","description":"Выбор темы стал понятнее и аккуратнее, поэтому найти начало для новой истории теперь проще."},
   {"id":"characters","kind":"improved","title":"Знакомые герои выглядят последовательнее","description":"Выбранные персонажи теперь надёжнее сохраняют узнаваемую внешность на разных иллюстрациях сказки."}
 ]$$::jsonb,
 'Новое в WonderTales: праздники, традиции и ещё более знакомые герои',
 'Откройте новую тему сказок и улучшения, которые делают каждое приключение более личным.',
 $$[
   {"id":"intro","type":"paragraph","text":"Мы добавили новый способ превращать важные семейные моменты в сказки и упростили выбор темы для следующего приключения."},
   {"id":"highlights","type":"list","items":["Создавайте сказки о праздниках и семейных традициях.","Пользуйтесь более понятным и аккуратным выбором тем.","Знакомые герои лучше сохраняют внешность на разных иллюстрациях."]},
   {"id":"cta","type":"button","label":"Создать праздничную сказку","url":"/wizard?scenarioCardId=holidays_traditions"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000714', 'es',
 'Más formas de hacer que cada cuento sea realmente vuestro',
 $$[
   {"id":"holidays","kind":"new","title":"Fiestas y tradiciones","description":"Crea cuentos entrañables sobre celebraciones familiares, tradiciones culturales y días especiales.","appUrl":"/wizard?scenarioCardId=holidays_traditions"},
   {"id":"topics","kind":"improved","title":"Explorar los temas es más fácil","description":"El selector de temas es más claro y cuidado, para que encontréis antes el punto de partida perfecto."},
   {"id":"characters","kind":"improved","title":"Los personajes familiares son más coherentes","description":"Los personajes elegidos conservan mejor su aspecto reconocible en las distintas ilustraciones del cuento."}
 ]$$::jsonb,
 'Novedades en WonderTales: fiestas, tradiciones y héroes más familiares',
 'Descubre un nuevo tema y mejoras que hacen que cada aventura se sienta más personal.',
 $$[
   {"id":"intro","type":"paragraph","text":"Hemos añadido una nueva forma de convertir momentos familiares importantes en cuentos y hemos simplificado la elección de la próxima aventura."},
   {"id":"highlights","type":"list","items":["Crea cuentos sobre fiestas y tradiciones familiares.","Explora un selector de temas más claro y cuidado.","Disfruta de personajes más coherentes entre ilustraciones."]},
   {"id":"cta","type":"button","label":"Crear un cuento festivo","url":"/wizard?scenarioCardId=holidays_traditions"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000714', 'de',
 'Noch mehr Möglichkeiten, jede Geschichte zu eurer eigenen zu machen',
 $$[
   {"id":"holidays","kind":"new","title":"Feste und Traditionen","description":"Erstellt warmherzige Geschichten über Familienfeste, kulturelle Traditionen und besondere Tage.","appUrl":"/wizard?scenarioCardId=holidays_traditions"},
   {"id":"topics","kind":"improved","title":"Geschichtenthemen lassen sich leichter entdecken","description":"Die Themenauswahl ist klarer und übersichtlicher, damit ihr schneller den passenden Ausgangspunkt findet."},
   {"id":"characters","kind":"improved","title":"Vertraute Figuren bleiben einheitlicher","description":"Ausgewählte Figuren behalten ihr wiedererkennbares Aussehen über verschiedene Illustrationen hinweg zuverlässiger bei."}
 ]$$::jsonb,
 'Neu bei WonderTales: Feste, Traditionen und noch vertrautere Helden',
 'Entdeckt ein neues Thema und Verbesserungen, die jedes Abenteuer persönlicher machen.',
 $$[
   {"id":"intro","type":"paragraph","text":"Wir haben eine neue Möglichkeit geschaffen, besondere Familienmomente in Geschichten zu verwandeln, und die Wahl des nächsten Abenteuers vereinfacht."},
   {"id":"highlights","type":"list","items":["Erstellt Geschichten über Feste und Familientraditionen.","Nutzt eine klarere, übersichtlichere Themenauswahl.","Erlebt vertraute Figuren einheitlicher in allen Illustrationen."]},
   {"id":"cta","type":"button","label":"Festliche Geschichte erstellen","url":"/wizard?scenarioCardId=holidays_traditions"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000714', 'fr',
 'Encore plus de façons de rendre chaque histoire vraiment unique',
 $$[
   {"id":"holidays","kind":"new","title":"Fêtes et traditions","description":"Créez de tendres histoires autour des fêtes de famille, des traditions culturelles et des journées particulières.","appUrl":"/wizard?scenarioCardId=holidays_traditions"},
   {"id":"topics","kind":"improved","title":"Les thèmes sont plus faciles à explorer","description":"Le sélecteur de thèmes est plus clair et soigné pour trouver plus vite le bon point de départ."},
   {"id":"characters","kind":"improved","title":"Les personnages familiers restent plus cohérents","description":"Les personnages choisis conservent plus fidèlement leur apparence reconnaissable d’une illustration à l’autre."}
 ]$$::jsonb,
 'Nouveautés WonderTales : fêtes, traditions et héros encore plus familiers',
 'Découvrez un nouveau thème et des améliorations qui rendent chaque aventure plus personnelle.',
 $$[
   {"id":"intro","type":"paragraph","text":"Nous avons ajouté une nouvelle façon de transformer les moments importants en famille en histoires et simplifié le choix de la prochaine aventure."},
   {"id":"highlights","type":"list","items":["Créez des histoires autour des fêtes et traditions familiales.","Explorez un sélecteur de thèmes plus clair et soigné.","Retrouvez des personnages plus cohérents entre les illustrations."]},
   {"id":"cta","type":"button","label":"Créer une histoire de fête","url":"/wizard?scenarioCardId=holidays_traditions"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000714', 'pl',
 'Jeszcze więcej sposobów, by każda opowieść była naprawdę Wasza',
 $$[
   {"id":"holidays","kind":"new","title":"Święta i tradycje","description":"Twórzcie ciepłe opowieści o rodzinnych uroczystościach, tradycjach kulturowych i wyjątkowych dniach.","appUrl":"/wizard?scenarioCardId=holidays_traditions"},
   {"id":"topics","kind":"improved","title":"Tematy opowieści łatwiej przeglądać","description":"Wybór tematu jest teraz przejrzystszy i bardziej dopracowany, więc szybciej znajdziecie dobry początek."},
   {"id":"characters","kind":"improved","title":"Znajomi bohaterowie są bardziej spójni","description":"Wybrane postacie lepiej zachowują rozpoznawalny wygląd na kolejnych ilustracjach opowieści."}
 ]$$::jsonb,
 'Nowości w WonderTales: święta, tradycje i jeszcze bardziej znajomi bohaterowie',
 'Odkryjcie nowy temat i ulepszenia, dzięki którym każda przygoda jest bardziej osobista.',
 $$[
   {"id":"intro","type":"paragraph","text":"Dodaliśmy nowy sposób zamieniania ważnych rodzinnych chwil w opowieści i ułatwiliśmy wybór kolejnej przygody."},
   {"id":"highlights","type":"list","items":["Twórzcie opowieści o świętach i rodzinnych tradycjach.","Korzystajcie z przejrzystszego wyboru tematów.","Oglądajcie bardziej spójnych bohaterów na kolejnych ilustracjach."]},
   {"id":"cta","type":"button","label":"Stwórz świąteczną opowieść","url":"/wizard?scenarioCardId=holidays_traditions"}
 ]$$::jsonb),

-- 10 July: instant character matching and comic art
('a0000000-0000-4000-8000-000000000710', 'en', 'Stronger character continuity and richer comic art',
 $$[
   {"id":"instant-identity","kind":"improved","title":"Instant characters look more like themselves","description":"Characters created from a photo now keep their defining features more reliably from the very first story."},
   {"id":"comic-covers","kind":"improved","title":"Comic covers match the adventure inside","description":"Comic-style stories now use a matching story panel for the cover, making the whole book feel more cohesive."},
   {"id":"pencil-art","kind":"improved","title":"Richer full-page colored-pencil art","description":"Colored-pencil stories now make better use of the full page for a more immersive illustrated-book feel."}
 ]$$::jsonb,
 'Your WonderTales characters just became more recognizable',
 'More consistent heroes, cohesive comic covers and richer full-page artwork are here.',
 $$[
   {"id":"intro","type":"paragraph","text":"This update focuses on visual continuity: the hero you create should feel like the same hero on every page."},
   {"id":"highlights","type":"list","items":["More recognizable instant characters from the first story.","Comic covers that visually match the adventure inside.","Richer full-page colored-pencil illustrations."]},
   {"id":"cta","type":"button","label":"Create a story","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000710', 'uk', 'Послідовніші герої та виразніші комікси',
 $$[
   {"id":"instant-identity","kind":"improved","title":"Миттєві персонажі більше схожі на себе","description":"Герої, створені з фотографії, тепер надійніше зберігають характерні риси вже з першої казки."},
   {"id":"comic-covers","kind":"improved","title":"Обкладинка коміксу відповідає пригоді","description":"Казки у стилі коміксу тепер використовують відповідний кадр історії для обкладинки, тому книжка виглядає цілісніше."},
   {"id":"pencil-art","kind":"improved","title":"Насиченіші повносторінкові олівцеві ілюстрації","description":"Казки в стилі кольорових олівців краще використовують усю сторінку й більше нагадують справжню ілюстровану книжку."}
 ]$$::jsonb,
 'Ваші герої WonderTales стали ще впізнаванішими',
 'Послідовніші персонажі, цілісні обкладинки коміксів і виразніші ілюстрації вже доступні.',
 $$[
   {"id":"intro","type":"paragraph","text":"Це оновлення присвячене візуальній послідовності: створений вами герой має залишатися тим самим на кожній сторінці."},
   {"id":"highlights","type":"list","items":["Упізнаваніші миттєві персонажі вже з першої казки.","Обкладинки коміксів, що відповідають пригоді всередині.","Виразніші повносторінкові олівцеві ілюстрації."]},
   {"id":"cta","type":"button","label":"Створити казку","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000710', 'ru', 'Более последовательные герои и выразительные комиксы',
 $$[
   {"id":"instant-identity","kind":"improved","title":"Мгновенные персонажи больше похожи на себя","description":"Герои, созданные по фотографии, теперь надёжнее сохраняют характерные черты уже с первой сказки."},
   {"id":"comic-covers","kind":"improved","title":"Обложка комикса соответствует приключению","description":"Сказки в стиле комикса теперь используют подходящий кадр истории для обложки, поэтому книга выглядит целостнее."},
   {"id":"pencil-art","kind":"improved","title":"Более насыщенные карандашные иллюстрации на всю страницу","description":"Сказки в стиле цветных карандашей лучше используют всю страницу и больше похожи на настоящую иллюстрированную книгу."}
 ]$$::jsonb,
 'Ваши герои WonderTales стали ещё узнаваемее',
 'Более последовательные персонажи, цельные обложки комиксов и выразительные иллюстрации уже доступны.',
 $$[
   {"id":"intro","type":"paragraph","text":"Это обновление посвящено визуальной последовательности: созданный вами герой должен оставаться тем же на каждой странице."},
   {"id":"highlights","type":"list","items":["Более узнаваемые мгновенные персонажи уже с первой сказки.","Обложки комиксов, соответствующие приключению внутри.","Выразительные карандашные иллюстрации на всю страницу."]},
   {"id":"cta","type":"button","label":"Создать сказку","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000710', 'es', 'Personajes más coherentes y cómics más expresivos',
 $$[
   {"id":"instant-identity","kind":"improved","title":"Los personajes instantáneos se parecen más a sí mismos","description":"Los personajes creados a partir de una foto conservan mejor sus rasgos desde el primer cuento."},
   {"id":"comic-covers","kind":"improved","title":"Las portadas de cómic encajan con la aventura","description":"Los cuentos en formato cómic usan ahora una viñeta correspondiente como portada para que todo el libro resulte más coherente."},
   {"id":"pencil-art","kind":"improved","title":"Ilustraciones a lápiz más ricas y a página completa","description":"Los cuentos a lápices de colores aprovechan mejor toda la página y se sienten como un libro ilustrado más envolvente."}
 ]$$::jsonb,
 'Tus personajes de WonderTales ahora son aún más reconocibles',
 'Ya están aquí héroes más coherentes, portadas de cómic integradas e ilustraciones más ricas.',
 $$[
   {"id":"intro","type":"paragraph","text":"Esta actualización se centra en la continuidad visual: el héroe que creas debe seguir siendo el mismo en cada página."},
   {"id":"highlights","type":"list","items":["Personajes instantáneos más reconocibles desde el primer cuento.","Portadas de cómic que encajan con la aventura interior.","Ilustraciones a lápiz más ricas y a página completa."]},
   {"id":"cta","type":"button","label":"Crear un cuento","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000710', 'de', 'Stärkere Figurenkontinuität und ausdrucksvollere Comic-Kunst',
 $$[
   {"id":"instant-identity","kind":"improved","title":"Sofortfiguren sehen sich selbst ähnlicher","description":"Aus einem Foto erstellte Figuren behalten ihre prägenden Merkmale nun schon ab der ersten Geschichte zuverlässiger bei."},
   {"id":"comic-covers","kind":"improved","title":"Comic-Cover passen zum Abenteuer","description":"Comic-Geschichten verwenden nun ein passendes Bild aus der Geschichte als Cover, sodass das ganze Buch stimmiger wirkt."},
   {"id":"pencil-art","kind":"improved","title":"Ausdrucksvollere ganzseitige Buntstiftkunst","description":"Buntstift-Geschichten nutzen die ganze Seite besser und wirken dadurch noch mehr wie ein liebevoll illustriertes Buch."}
 ]$$::jsonb,
 'Eure WonderTales-Figuren sind jetzt noch leichter wiederzuerkennen',
 'Einheitlichere Helden, passende Comic-Cover und ausdrucksvollere ganzseitige Kunst sind da.',
 $$[
   {"id":"intro","type":"paragraph","text":"Bei diesem Update geht es um visuelle Kontinuität: Der von euch erstellte Held soll auf jeder Seite derselbe bleiben."},
   {"id":"highlights","type":"list","items":["Wiedererkennbarere Sofortfiguren ab der ersten Geschichte.","Comic-Cover, die zum Abenteuer im Inneren passen.","Ausdrucksvollere ganzseitige Buntstiftillustrationen."]},
   {"id":"cta","type":"button","label":"Geschichte erstellen","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000710', 'fr', 'Des personnages plus cohérents et des BD plus expressives',
 $$[
   {"id":"instant-identity","kind":"improved","title":"Les personnages instantanés se ressemblent davantage","description":"Les personnages créés à partir d’une photo conservent mieux leurs traits distinctifs dès la première histoire."},
   {"id":"comic-covers","kind":"improved","title":"Les couvertures de BD correspondent à l’aventure","description":"Les histoires en BD utilisent désormais une case assortie en couverture pour donner plus de cohérence à l’ensemble du livre."},
   {"id":"pencil-art","kind":"improved","title":"Des illustrations au crayon plus riches en pleine page","description":"Les histoires aux crayons de couleur profitent mieux de toute la page et ressemblent encore davantage à un bel album illustré."}
 ]$$::jsonb,
 'Vos personnages WonderTales sont encore plus reconnaissables',
 'Des héros plus cohérents, des couvertures de BD assorties et des illustrations plus riches sont disponibles.',
 $$[
   {"id":"intro","type":"paragraph","text":"Cette mise à jour privilégie la continuité visuelle : le héros que vous créez doit rester le même sur chaque page."},
   {"id":"highlights","type":"list","items":["Des personnages instantanés plus reconnaissables dès la première histoire.","Des couvertures de BD assorties à l’aventure.","Des illustrations au crayon plus riches en pleine page."]},
   {"id":"cta","type":"button","label":"Créer une histoire","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000710', 'pl', 'Spójniejsi bohaterowie i bogatsza komiksowa oprawa',
 $$[
   {"id":"instant-identity","kind":"improved","title":"Błyskawiczne postacie są bardziej podobne do siebie","description":"Bohaterowie utworzeni ze zdjęcia lepiej zachowują charakterystyczne cechy już od pierwszej opowieści."},
   {"id":"comic-covers","kind":"improved","title":"Okładki komiksów pasują do przygody","description":"Opowieści komiksowe wykorzystują teraz pasujący kadr jako okładkę, dzięki czemu cała książka jest bardziej spójna."},
   {"id":"pencil-art","kind":"improved","title":"Bogatsze całostronicowe ilustracje kredkami","description":"Opowieści rysowane kredkami lepiej wykorzystują całą stronę i jeszcze bardziej przypominają pięknie ilustrowaną książkę."}
 ]$$::jsonb,
 'Bohaterowie WonderTales są teraz jeszcze łatwiejsi do rozpoznania',
 'Spójniejsze postacie, dopasowane okładki komiksów i bogatsze ilustracje są już dostępne.',
 $$[
   {"id":"intro","type":"paragraph","text":"Ta aktualizacja skupia się na ciągłości wizualnej: stworzony przez Was bohater powinien pozostać sobą na każdej stronie."},
   {"id":"highlights","type":"list","items":["Bardziej rozpoznawalne błyskawiczne postacie od pierwszej opowieści.","Okładki komiksów dopasowane do przygody w środku.","Bogatsze całostronicowe ilustracje kredkami."]},
   {"id":"cta","type":"button","label":"Stwórz opowieść","url":"/wizard"}
 ]$$::jsonb),

-- 9 July: dashboard and mobile experience
('a0000000-0000-4000-8000-000000000709', 'en', 'A calmer, more personal home screen',
 $$[
   {"id":"greetings","kind":"new","title":"Greetings that fit your rhythm","description":"The dashboard now welcomes you differently depending on when you return, making each visit feel more personal."},
   {"id":"library-filters","kind":"improved","title":"A cleaner story library on mobile","description":"Library filters now live in a compact pop-up, leaving more room for your stories."},
   {"id":"mobile-setup","kind":"improved","title":"Smoother story setup on small screens","description":"Story creation and child details use space more efficiently on phones, with the important choices close at hand."}
 ]$$::jsonb,
 'A more personal WonderTales welcome',
 'Your dashboard, mobile library and story setup now feel calmer and easier to use.',
 $$[
   {"id":"intro","type":"paragraph","text":"Small interface details can make family story time feel much simpler. We have polished the places you visit most often."},
   {"id":"highlights","type":"list","items":["Personal greetings that adapt to your visit rhythm.","More room for stories in the mobile library.","A smoother setup flow on smaller screens."]},
   {"id":"cta","type":"button","label":"Open WonderTales","url":"/dashboard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000709', 'uk', 'Спокійніший і більш особистий головний екран',
 $$[
   {"id":"greetings","kind":"new","title":"Привітання у вашому ритмі","description":"Головний екран тепер вітає вас по-різному залежно від часу повернення, роблячи кожен візит особистішим."},
   {"id":"library-filters","kind":"improved","title":"Охайніша мобільна бібліотека","description":"Фільтри бібліотеки тепер відкриваються в компактному вікні, залишаючи більше місця для ваших казок."},
   {"id":"mobile-setup","kind":"improved","title":"Зручніше створення казки на малих екранах","description":"Створення казок і сторінки дітей ефективніше використовують простір телефона, а важливі налаштування завжди поруч."}
 ]$$::jsonb,
 'Ще особистіше привітання у WonderTales',
 'Головний екран, мобільна бібліотека та створення казки стали спокійнішими й зручнішими.',
 $$[
   {"id":"intro","type":"paragraph","text":"Невеликі деталі інтерфейсу можуть суттєво спростити родинний час із казками. Ми вдосконалили місця, якими ви користуєтеся найчастіше."},
   {"id":"highlights","type":"list","items":["Особисті привітання, що враховують ритм ваших візитів.","Більше місця для казок у мобільній бібліотеці.","Зручніший процес створення на малих екранах."]},
   {"id":"cta","type":"button","label":"Відкрити WonderTales","url":"/dashboard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000709', 'ru', 'Более спокойный и личный главный экран',
 $$[
   {"id":"greetings","kind":"new","title":"Приветствия в вашем ритме","description":"Главный экран теперь приветствует вас по-разному в зависимости от времени возвращения, делая каждый визит более личным."},
   {"id":"library-filters","kind":"improved","title":"Более аккуратная мобильная библиотека","description":"Фильтры библиотеки теперь открываются в компактном окне, оставляя больше места для ваших сказок."},
   {"id":"mobile-setup","kind":"improved","title":"Удобнее создавать сказки на небольших экранах","description":"Создание сказок и страницы детей эффективнее используют пространство телефона, а важные настройки остаются под рукой."}
 ]$$::jsonb,
 'Ещё более личное приветствие в WonderTales',
 'Главный экран, мобильная библиотека и создание сказок стали спокойнее и удобнее.',
 $$[
   {"id":"intro","type":"paragraph","text":"Небольшие детали интерфейса могут заметно упростить семейное время со сказками. Мы улучшили места, которыми вы пользуетесь чаще всего."},
   {"id":"highlights","type":"list","items":["Личные приветствия с учётом ритма ваших визитов.","Больше места для сказок в мобильной библиотеке.","Более удобное создание на небольших экранах."]},
   {"id":"cta","type":"button","label":"Открыть WonderTales","url":"/dashboard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000709', 'es', 'Una pantalla de inicio más tranquila y personal',
 $$[
   {"id":"greetings","kind":"new","title":"Saludos que siguen vuestro ritmo","description":"El panel os recibe de forma distinta según cuándo volváis, para que cada visita sea más personal."},
   {"id":"library-filters","kind":"improved","title":"Una biblioteca móvil más despejada","description":"Los filtros de la biblioteca viven ahora en una ventana compacta y dejan más espacio para vuestros cuentos."},
   {"id":"mobile-setup","kind":"improved","title":"Creación más fluida en pantallas pequeñas","description":"La creación de cuentos y los perfiles infantiles aprovechan mejor el espacio del teléfono y mantienen cerca las opciones importantes."}
 ]$$::jsonb,
 'Una bienvenida más personal en WonderTales',
 'El panel, la biblioteca móvil y la creación de cuentos son ahora más tranquilos y fáciles de usar.',
 $$[
   {"id":"intro","type":"paragraph","text":"Los pequeños detalles pueden simplificar mucho el momento familiar de los cuentos. Hemos cuidado los lugares que visitáis con más frecuencia."},
   {"id":"highlights","type":"list","items":["Saludos personales adaptados al ritmo de visitas.","Más espacio para los cuentos en la biblioteca móvil.","Una creación más fluida en pantallas pequeñas."]},
   {"id":"cta","type":"button","label":"Abrir WonderTales","url":"/dashboard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000709', 'de', 'Ein ruhigerer, persönlicherer Startbildschirm',
 $$[
   {"id":"greetings","kind":"new","title":"Begrüßungen, die zu eurem Rhythmus passen","description":"Das Dashboard begrüßt euch je nach Zeitpunkt eurer Rückkehr unterschiedlich und macht jeden Besuch persönlicher."},
   {"id":"library-filters","kind":"improved","title":"Eine aufgeräumtere mobile Bibliothek","description":"Die Bibliotheksfilter befinden sich jetzt in einem kompakten Fenster und lassen mehr Platz für eure Geschichten."},
   {"id":"mobile-setup","kind":"improved","title":"Reibungslosere Erstellung auf kleinen Bildschirmen","description":"Geschichtenerstellung und Kinderprofile nutzen den Platz auf dem Handy besser und halten wichtige Optionen griffbereit."}
 ]$$::jsonb,
 'Eine persönlichere Begrüßung bei WonderTales',
 'Dashboard, mobile Bibliothek und Geschichtenerstellung sind jetzt ruhiger und einfacher zu bedienen.',
 $$[
   {"id":"intro","type":"paragraph","text":"Kleine Details können die gemeinsame Geschichtenzeit deutlich vereinfachen. Wir haben die Bereiche verbessert, die ihr am häufigsten besucht."},
   {"id":"highlights","type":"list","items":["Persönliche Begrüßungen passend zu eurem Besuchsrhythmus.","Mehr Platz für Geschichten in der mobilen Bibliothek.","Eine reibungslosere Erstellung auf kleinen Bildschirmen."]},
   {"id":"cta","type":"button","label":"WonderTales öffnen","url":"/dashboard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000709', 'fr', 'Un accueil plus calme et plus personnel',
 $$[
   {"id":"greetings","kind":"new","title":"Des salutations qui suivent votre rythme","description":"Le tableau de bord vous accueille différemment selon le moment de votre retour, pour rendre chaque visite plus personnelle."},
   {"id":"library-filters","kind":"improved","title":"Une bibliothèque mobile plus épurée","description":"Les filtres de la bibliothèque s’ouvrent désormais dans une fenêtre compacte et laissent plus de place à vos histoires."},
   {"id":"mobile-setup","kind":"improved","title":"Une création plus fluide sur petit écran","description":"La création d’histoires et les profils enfants utilisent mieux l’espace du téléphone tout en gardant les choix importants à portée de main."}
 ]$$::jsonb,
 'Un accueil WonderTales plus personnel',
 'Le tableau de bord, la bibliothèque mobile et la création d’histoires sont maintenant plus simples et apaisés.',
 $$[
   {"id":"intro","type":"paragraph","text":"De petits détails peuvent beaucoup simplifier le moment des histoires en famille. Nous avons soigné les espaces que vous utilisez le plus."},
   {"id":"highlights","type":"list","items":["Des salutations personnelles adaptées à votre rythme de visite.","Plus de place pour les histoires dans la bibliothèque mobile.","Une création plus fluide sur les petits écrans."]},
   {"id":"cta","type":"button","label":"Ouvrir WonderTales","url":"/dashboard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000709', 'pl', 'Spokojniejszy i bardziej osobisty ekran główny',
 $$[
   {"id":"greetings","kind":"new","title":"Powitania dopasowane do Waszego rytmu","description":"Panel wita Was inaczej zależnie od pory powrotu, dzięki czemu każda wizyta staje się bardziej osobista."},
   {"id":"library-filters","kind":"improved","title":"Czytelniejsza biblioteka na telefonie","description":"Filtry biblioteki otwierają się teraz w kompaktowym oknie, zostawiając więcej miejsca na Wasze opowieści."},
   {"id":"mobile-setup","kind":"improved","title":"Płynniejsze tworzenie na małych ekranach","description":"Tworzenie opowieści i profile dzieci lepiej wykorzystują przestrzeń telefonu, a ważne opcje są zawsze pod ręką."}
 ]$$::jsonb,
 'Bardziej osobiste powitanie w WonderTales',
 'Panel, mobilna biblioteka i tworzenie opowieści są teraz spokojniejsze i łatwiejsze w użyciu.',
 $$[
   {"id":"intro","type":"paragraph","text":"Drobne szczegóły mogą znacznie uprościć rodzinny czas z opowieściami. Dopracowaliśmy miejsca, do których zaglądacie najczęściej."},
   {"id":"highlights","type":"list","items":["Osobiste powitania dopasowane do rytmu wizyt.","Więcej miejsca na opowieści w mobilnej bibliotece.","Płynniejsze tworzenie na małych ekranach."]},
   {"id":"cta","type":"button","label":"Otwórz WonderTales","url":"/dashboard"}
 ]$$::jsonb),

-- 2 July: mixed stories, reading controls, voices and child characters
('a0000000-0000-4000-8000-000000000702', 'en', 'New ways to read, listen and create together',
 $$[
   {"id":"mixed-stories","kind":"new","title":"Stories that mix prose and comics","description":"A new mixed format combines flowing illustrated text with lively comic moments in one adventure.","blogUrl":"/blog/comic-stories-reading-bridge"},
   {"id":"text-size","kind":"new","title":"Story text that fits each reader","description":"Adjust the reading size while age-aware defaults keep stories comfortable and easy to follow.","blogUrl":"/blog/text-display-reading-comfort"},
   {"id":"voices","kind":"improved","title":"Voices better matched to the story language","description":"Premium narration now chooses voices with language in mind for a more natural listening experience.","blogUrl":"/blog/audio-bedtime-stories"},
   {"id":"child-characters","kind":"improved","title":"Child profiles are ready to join the story","description":"A child profile can now be used directly as a character, with less duplicate setup.","blogUrl":"/blog/child-created-characters"}
 ]$$::jsonb,
 'New: mixed stories, flexible reading and better voices',
 'Read, listen and create together with four meaningful WonderTales improvements.',
 $$[
   {"id":"intro","type":"paragraph","text":"Every family enjoys stories differently, so this update adds more choice to reading, listening and creating together."},
   {"id":"highlights","type":"list","items":["Mix flowing prose and comic scenes in one story.","Adjust text size for a comfortable reading experience.","Hear premium voices better matched to the story language.","Use a child profile directly as a story character."]},
   {"id":"cta","type":"button","label":"Choose your next story","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000702', 'uk', 'Нові способи читати, слухати й творити разом',
 $$[
   {"id":"mixed-stories","kind":"new","title":"Казки, що поєднують прозу й комікси","description":"Новий змішаний формат поєднує плавний ілюстрований текст із жвавими сценами коміксу в одній пригоді.","blogUrl":"/uk/blog/comic-stories-reading-bridge"},
   {"id":"text-size","kind":"new","title":"Розмір тексту для кожного читача","description":"Змінюйте розмір під час читання, а вікові налаштування за замовчуванням допоможуть зберегти комфорт.","blogUrl":"/uk/blog/text-display-reading-comfort"},
   {"id":"voices","kind":"improved","title":"Голоси краще відповідають мові казки","description":"Преміум-озвучення тепер враховує мову казки, щоб розповідь звучала природніше.","blogUrl":"/uk/blog/audio-bedtime-stories"},
   {"id":"child-characters","kind":"improved","title":"Профіль дитини готовий стати героєм","description":"Профіль дитини тепер можна одразу використати як персонажа без зайвого повторного налаштування.","blogUrl":"/uk/blog/child-created-characters"}
 ]$$::jsonb,
 'Нове: змішані казки, зручне читання та кращі голоси',
 'Читайте, слухайте й творіть разом із чотирма важливими оновленнями WonderTales.',
 $$[
   {"id":"intro","type":"paragraph","text":"Кожна родина по-своєму насолоджується казками, тому це оновлення дає більше вибору для спільного читання, слухання й творчості."},
   {"id":"highlights","type":"list","items":["Поєднуйте плавну прозу та сцени коміксу в одній казці.","Налаштовуйте розмір тексту для комфортного читання.","Слухайте преміум-голоси, краще дібрані до мови казки.","Використовуйте профіль дитини безпосередньо як героя."]},
   {"id":"cta","type":"button","label":"Обрати наступну казку","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000702', 'ru', 'Новые способы читать, слушать и творить вместе',
 $$[
   {"id":"mixed-stories","kind":"new","title":"Сказки, объединяющие прозу и комиксы","description":"Новый смешанный формат сочетает плавный иллюстрированный текст с живыми сценами комикса в одном приключении.","blogUrl":"/ru/blog/comic-stories-reading-bridge"},
   {"id":"text-size","kind":"new","title":"Размер текста для каждого читателя","description":"Меняйте размер во время чтения, а возрастные настройки по умолчанию помогут сохранить комфорт.","blogUrl":"/ru/blog/text-display-reading-comfort"},
   {"id":"voices","kind":"improved","title":"Голоса лучше соответствуют языку сказки","description":"Премиальная озвучка теперь учитывает язык сказки, чтобы повествование звучало естественнее.","blogUrl":"/ru/blog/audio-bedtime-stories"},
   {"id":"child-characters","kind":"improved","title":"Профиль ребёнка готов стать героем","description":"Профиль ребёнка теперь можно сразу использовать как персонажа без лишней повторной настройки.","blogUrl":"/ru/blog/child-created-characters"}
 ]$$::jsonb,
 'Новое: смешанные сказки, удобное чтение и лучшие голоса',
 'Читайте, слушайте и творите вместе с четырьмя важными обновлениями WonderTales.',
 $$[
   {"id":"intro","type":"paragraph","text":"Каждая семья по-своему наслаждается сказками, поэтому это обновление даёт больше выбора для совместного чтения, прослушивания и творчества."},
   {"id":"highlights","type":"list","items":["Сочетайте плавную прозу и сцены комикса в одной сказке.","Настраивайте размер текста для комфортного чтения.","Слушайте премиальные голоса, лучше подобранные к языку сказки.","Используйте профиль ребёнка непосредственно как героя."]},
   {"id":"cta","type":"button","label":"Выбрать следующую сказку","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000702', 'es', 'Nuevas formas de leer, escuchar y crear juntos',
 $$[
   {"id":"mixed-stories","kind":"new","title":"Cuentos que mezclan narración y cómic","description":"Un nuevo formato mixto combina texto ilustrado fluido con animados momentos de cómic en una sola aventura.","blogUrl":"/es/blog/comic-stories-reading-bridge"},
   {"id":"text-size","kind":"new","title":"Un tamaño de texto para cada lector","description":"Ajusta el tamaño durante la lectura mientras los valores según la edad mantienen el cuento cómodo y fácil de seguir.","blogUrl":"/es/blog/text-display-reading-comfort"},
   {"id":"voices","kind":"improved","title":"Voces mejor adaptadas al idioma del cuento","description":"La narración prémium elige ahora las voces teniendo en cuenta el idioma para ofrecer una escucha más natural.","blogUrl":"/es/blog/audio-bedtime-stories"},
   {"id":"child-characters","kind":"improved","title":"Los perfiles infantiles ya pueden entrar en el cuento","description":"Ahora podéis usar directamente un perfil infantil como personaje, sin repetir configuraciones.","blogUrl":"/es/blog/child-created-characters"}
 ]$$::jsonb,
 'Nuevo: cuentos mixtos, lectura flexible y mejores voces',
 'Leed, escuchad y cread juntos con cuatro mejoras importantes de WonderTales.',
 $$[
   {"id":"intro","type":"paragraph","text":"Cada familia disfruta los cuentos de una manera distinta, así que esta actualización ofrece más opciones para leer, escuchar y crear juntos."},
   {"id":"highlights","type":"list","items":["Combinad narración fluida y escenas de cómic en un solo cuento.","Ajustad el tamaño del texto para leer cómodamente.","Escuchad voces prémium mejor adaptadas al idioma.","Usad directamente un perfil infantil como personaje."]},
   {"id":"cta","type":"button","label":"Elegir el próximo cuento","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000702', 'de', 'Neue Wege, gemeinsam zu lesen, zu hören und zu gestalten',
 $$[
   {"id":"mixed-stories","kind":"new","title":"Geschichten, die Erzähltext und Comics verbinden","description":"Ein neues Mischformat verbindet fließenden illustrierten Text mit lebendigen Comic-Momenten in einem Abenteuer.","blogUrl":"/de/blog/comic-stories-reading-bridge"},
   {"id":"text-size","kind":"new","title":"Die passende Textgröße für jedes Kind","description":"Passt die Größe beim Lesen an, während altersgerechte Standardwerte für ein angenehmes Lesegefühl sorgen.","blogUrl":"/de/blog/text-display-reading-comfort"},
   {"id":"voices","kind":"improved","title":"Stimmen passen besser zur Sprache der Geschichte","description":"Die Premium-Vertonung wählt Stimmen nun passend zur Sprache aus und klingt dadurch natürlicher.","blogUrl":"/de/blog/audio-bedtime-stories"},
   {"id":"child-characters","kind":"improved","title":"Kinderprofile können direkt mitspielen","description":"Ein Kinderprofil lässt sich jetzt ohne doppelte Einrichtung direkt als Figur verwenden.","blogUrl":"/de/blog/child-created-characters"}
 ]$$::jsonb,
 'Neu: gemischte Geschichten, flexibles Lesen und bessere Stimmen',
 'Lest, hört und gestaltet gemeinsam mit vier wichtigen WonderTales-Verbesserungen.',
 $$[
   {"id":"intro","type":"paragraph","text":"Jede Familie genießt Geschichten anders. Deshalb bietet dieses Update mehr Auswahl beim gemeinsamen Lesen, Hören und Gestalten."},
   {"id":"highlights","type":"list","items":["Verbindet fließenden Erzähltext und Comic-Szenen in einer Geschichte.","Passt die Textgröße für angenehmes Lesen an.","Hört Premium-Stimmen, die besser zur Sprache passen.","Nutzt ein Kinderprofil direkt als Geschichtenfigur."]},
   {"id":"cta","type":"button","label":"Nächste Geschichte wählen","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000702', 'fr', 'De nouvelles façons de lire, d’écouter et de créer ensemble',
 $$[
   {"id":"mixed-stories","kind":"new","title":"Des histoires qui mêlent récit et bande dessinée","description":"Un nouveau format mixte associe un texte illustré fluide à des moments de BD vivants au sein d’une même aventure.","blogUrl":"/fr/blog/comic-stories-reading-bridge"},
   {"id":"text-size","kind":"new","title":"Une taille de texte adaptée à chaque lecteur","description":"Réglez la taille pendant la lecture tandis que les valeurs adaptées à l’âge assurent un confort naturel.","blogUrl":"/fr/blog/text-display-reading-comfort"},
   {"id":"voices","kind":"improved","title":"Des voix mieux adaptées à la langue de l’histoire","description":"La narration premium choisit désormais les voix en fonction de la langue pour une écoute plus naturelle.","blogUrl":"/fr/blog/audio-bedtime-stories"},
   {"id":"child-characters","kind":"improved","title":"Les profils enfants peuvent rejoindre directement l’histoire","description":"Un profil enfant peut maintenant servir directement de personnage, sans configuration en double.","blogUrl":"/fr/blog/child-created-characters"}
 ]$$::jsonb,
 'Nouveau : histoires mixtes, lecture flexible et voix améliorées',
 'Lisez, écoutez et créez ensemble grâce à quatre améliorations importantes de WonderTales.',
 $$[
   {"id":"intro","type":"paragraph","text":"Chaque famille apprécie les histoires à sa façon. Cette mise à jour offre donc plus de choix pour lire, écouter et créer ensemble."},
   {"id":"highlights","type":"list","items":["Mêlez récit fluide et scènes de BD dans une même histoire.","Réglez la taille du texte pour lire confortablement.","Écoutez des voix premium mieux adaptées à la langue.","Utilisez directement un profil enfant comme personnage."]},
   {"id":"cta","type":"button","label":"Choisir la prochaine histoire","url":"/wizard"}
 ]$$::jsonb),
('a0000000-0000-4000-8000-000000000702', 'pl', 'Nowe sposoby wspólnego czytania, słuchania i tworzenia',
 $$[
   {"id":"mixed-stories","kind":"new","title":"Opowieści łączące narrację i komiks","description":"Nowy mieszany format łączy płynny ilustrowany tekst z żywymi scenami komiksowymi w jednej przygodzie.","blogUrl":"/pl/blog/comic-stories-reading-bridge"},
   {"id":"text-size","kind":"new","title":"Rozmiar tekstu dopasowany do czytelnika","description":"Zmieniajcie rozmiar podczas czytania, a ustawienia odpowiednie do wieku zadbają o wygodę i czytelność.","blogUrl":"/pl/blog/text-display-reading-comfort"},
   {"id":"voices","kind":"improved","title":"Głosy lepiej dopasowane do języka opowieści","description":"Narracja premium dobiera teraz głosy z uwzględnieniem języka, aby słuchanie brzmiało naturalniej.","blogUrl":"/pl/blog/audio-bedtime-stories"},
   {"id":"child-characters","kind":"improved","title":"Profile dzieci mogą od razu dołączyć do opowieści","description":"Profil dziecka można teraz wykorzystać bezpośrednio jako postać, bez powtarzania konfiguracji.","blogUrl":"/pl/blog/child-created-characters"}
 ]$$::jsonb,
 'Nowość: mieszane opowieści, elastyczne czytanie i lepsze głosy',
 'Czytajcie, słuchajcie i twórzcie razem dzięki czterem ważnym ulepszeniom WonderTales.',
 $$[
   {"id":"intro","type":"paragraph","text":"Każda rodzina inaczej cieszy się opowieściami, dlatego ta aktualizacja daje więcej możliwości wspólnego czytania, słuchania i tworzenia."},
   {"id":"highlights","type":"list","items":["Łączcie płynną narrację i sceny komiksowe w jednej opowieści.","Dopasujcie rozmiar tekstu do wygodnego czytania.","Słuchajcie głosów premium lepiej dopasowanych do języka.","Używajcie profilu dziecka bezpośrednio jako bohatera."]},
   {"id":"cta","type":"button","label":"Wybierz następną opowieść","url":"/wizard"}
 ]$$::jsonb);
