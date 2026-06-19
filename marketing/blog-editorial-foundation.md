# WonderTales Blog Editorial Foundation

Date: 2026-06-17

Status: draft for approval before assigning work to agents.

## Goal

Create SEO-friendly blog pages for WonderTales in all public SEO languages:

- Ukrainian: `/blog/:slug`
- English: `/en/blog/:slug`
- Russian: `/ru/blog/:slug`
- Spanish: `/es/blog/:slug`
- German: `/de/blog/:slug`
- French: `/fr/blog/:slug`
- Polish: `/pl/blog/:slug`

The blog should not be a thin marketing layer. Articles must answer real parent questions, show product value naturally, and avoid claims we cannot support.

The reference structure is the cookbook-style public page:

- `https://cookbook.wondertales.art/healthy-breakfasts`

## Product Basis

The current product already has a strong internal methodology:

- Age-aware story prompts in `services/api/src/prompts/helpers.ts`
- Content safety and scary-story boundaries in `services/api/src/prompts/contentPolicy.ts`
- Public SEO locale routing in `packages/shared/src/utils/routeOwnership.ts`
- Existing SSR renderers with canonical and `hreflang` patterns in `services/api/src/ssr/`

Important editorial caution:

WonderTales can say that story complexity is age-adapted and informed by readability practices, Lexile-style text complexity, safety rules, and internal generation policy. It should not claim that our exact Lexile bands, unique-word counts, or scene counts are official external standards.

## Parent Pain Points From Outreach

Source: `secrets/forum-outreach-log.md`

Recurring themes:

- Reading before sleep is a routine, not just entertainment.
- Parents want reading without pressure, especially for children who resist books.
- Audio stories are attractive when parents want a no-video bedtime option.
- Children engage more when they choose the hero, topic, moral, or favorite toy.
- Short "this still counts" story moments matter for tired parents.
- Some parents are skeptical that highly visual/personalized stories fit bedtime; bedtime often needs calm voice, repetition, imagination, intrigue, and a hoped-for happy ending.

## Evidence Rules

Use sources carefully:

- Cite sources for general principles.
- Do not overclaim causality.
- Do not present WonderTales as therapy, reading instruction, clinical intervention, or replacement for parent-child reading.
- When evidence is broad, phrase it as "supports the idea that..." rather than "proves that WonderTales..."

## Sources To Use

### ADHD And Attention

- CDC: `https://www.cdc.gov/adhd/treatment/index.html`

Use for:

- ADHD is a real clinical topic.
- Parent training and behavior supports matter.
- WonderTales should be framed as an attention-friendly routine/story tool, not treatment.

Do not claim:

- WonderTales treats ADHD.
- Personalized stories improve ADHD symptoms.

### Reading Development

- IES / What Works Clearinghouse K-3 foundational reading guide: `https://ies.ed.gov/ncee/wwc/PracticeGuide/21`
- NICHD National Reading Panel: `https://www.nichd.nih.gov/publications/pubs/nrp/smallbook`

Use for:

- Reading skills need structured support.
- Reading practice and story enjoyment are not the same thing.
- Story time can support exposure, fluency, vocabulary, and motivation, but should not be positioned as phonics instruction.

Do not claim:

- WonderTales replaces learn-to-read programs.
- A personalized story app alone teaches reading.

### Readability And Age Fit

- Lexile Hub for Educators: `https://hub.lexile.com/for-educators/`

Use for:

- Text complexity can be measured and matched to readers.
- Lexile-style thinking supports the idea of matching difficulty to ability.

Do not claim:

- A fixed age equals a fixed Lexile level.
- Our exact internal Lexile ranges are externally validated.

### Bedtime Routine

- Bedtime routine review: `https://doi.org/10.1016/j.smrv.2017.10.007`
- Nightly bedtime routine study: `https://doi.org/10.1093/sleep/32.5.599`

Use for:

- Consistent bedtime routines matter.
- Audio and short stories can be framed as part of a calming ritual.

Do not claim:

- WonderTales improves sleep outcomes.
- Audio stories solve bedtime problems.

### Personalization

- Reading personalized books with preschool children enhances word acquisition: `https://doi.org/10.1177/0142723714534221`
- Digital literacies and children's personalized books: `https://doi.org/10.14324/lre.18.2.01`

Use for:

- Personalized books can increase engagement and self-connection.
- Personalization can be meaningful when used thoughtfully.

Do not claim:

- Personalization always improves learning.
- A child's name or image alone is enough to make a story valuable.

### Social And Emotional Learning

- CASEL SEL fundamentals: `https://casel.org/fundamentals-of-sel/`

Use for:

- Stories can open conversations about empathy, self-control, relationships, and decisions.

Do not claim:

- WonderTales is an SEL curriculum.
- Moral stories replace adult conversation.

### International SEO

- Google localized versions / `hreflang`: `https://developers.google.com/search/docs/specialty/international/localized-versions`

Use for implementation:

- Each localized version should reference itself and all alternates.
- Include `x-default`.
- Keep canonical and language alternates consistent.

## Expert Quote Source Candidates

Use these as short editorial quote cards only where they support the article argument:

- Russell A. Barkley on ADHD performance/self-regulation: useful, but current quote source needs primary book verification before publication.
- Natalia Kucirkova on personalized books: `https://ucldigitalpress.co.uk/Book/Article/69/93/5183/`
- Jerome Bruner on age-appropriate teaching: `https://psychology.fas.harvard.edu/people/jerome-bruner`
- Patricia Kuhl on early language listening: `https://www.ted.com/talks/patricia_kuhl_the_linguistic_genius_of_babies`
- Maryanne Wolf on reading not being biologically automatic: `https://www.maryannewolf.com/proust-and-the-squid`
- Lev Vygotsky on assisted learning: `https://home.fau.edu/musgrove/web/vygotsky1978.pdf`
- Marc Brackett / Yale Center for Emotional Intelligence on emotions and learning: `https://www.ascd.org/el/articles/emotions-matter`
- Marc Brackett discussion guide: `https://marcbrackett.com/wp-content/uploads/2025/02/Permission-To-Feel-Book-Discussion-Guide.pdf`
- Mindell et al. on bedtime routines: `https://pmc.ncbi.nlm.nih.gov/articles/PMC2675894/`

## Article Briefs

Source-language draft: Russian. Localize only after the structure and claims are approved.

Each article should visually follow the cookbook reference page pattern:

- editorial hero with uppercase category label, H1, short lead, primary CTA, secondary contextual link, and a large rounded hero image;
- long-form sections with a small uppercase label before each H2;
- selected sections paired with warm storybook illustrations;
- one practical checklist/card section near the end;
- related-story/product CTA near the bottom, visually similar to cookbook catalog cards;
- generous whitespace, soft rounded surfaces, restrained borders, and image-led rhythm rather than a plain text blog.

Expert quote rules:

- Use at most one expert quote card per article.
- Keep each quote short, ideally under 18 words.
- Prefer named researchers and primary/institutional sources.
- Do not use quotes as decoration; place them after the section where they clarify the argument.
- Visually style quotes as calm editorial cards: soft background, small uppercase label `EXPERT NOTE`, large quotation text, source line with name, role, publication/context, and source link.
- If a quote is sourced from a secondary quote database or a book preview, mark it `needs primary verification` before publication.

### 1. Attention For Children With ADHD

Slug:

- `adhd-story-attention`

H1:

- Как удержать внимание ребенка с СДВГ во время сказки

Parent problem:

- The child wants stories but loses attention quickly.

Angle:

- Shorter story beats, choice, repeated anchors, visible progress, and low-pressure story rituals.

Product connection:

- WonderTales lets parents pick a theme, hero, length/age fit, audio, and familiar characters.

Evidence:

- CDC ADHD page.

Risk:

- Must not imply medical treatment.

Expert quote candidate:

- Quote: "ADHD is a disorder of performance—of doing what you know rather than knowing what to do."
- Attribution: Russell A. Barkley, clinical neuropsychologist and ADHD researcher.
- Source: `Taking Charge of Adult ADHD`, quoted by Goodreads; source confidence is medium.
- Verification note: needs primary book verification before publication.
- Placement: after the section about short scenes, external structure, and reducing reliance on sustained self-regulation.

H2:

- Почему обычная сказка может быстро терять ребенка
- Что помогает вниманию: короткие сцены, выбор и повторение
- Как сделать историю активной, но не перевозбуждающей
- Почему знакомый герой работает лучше случайного персонажа
- Как использовать аудио и чтение вслух без давления
- Где граница: WonderTales не лечит СДВГ
- Практический чеклист для вечерней истории

Cookbook-style page notes:

- Hero label: `УВАГА`
- Hero image: a child following glowing story stepping stones, with a calm parent nearby.
- Section image rhythm: one image near the opening section, one practical/checklist illustration near the end.
- Bottom CTA: create a short personalized story with a familiar hero.

Visual direction:

- Magical but organized, calm, clear, not chaotic or clinical.

### 2. Personalized Children's Stories

Slug:

- `personalized-childrens-stories`

H1:

- Почему персонализированные сказки сильнее цепляют ребенка

Parent problem:

- Generic stories do not always capture the child's attention.

Angle:

- Personalization works best when it connects to a child's world: name, favorite toy, sibling, pet, fear, wish, or current phase.

Product connection:

- Child profiles, character creation, recurring heroes, personalized illustrations.

Evidence:

- Personalized books research.

Risk:

- Do not reduce personalization to "put the child's name in the text."

Expert quote candidate:

- Quote: "children learnt more new words if these appeared in the personalised book"
- Attribution: Natalia Kucirkova, professor and researcher of children's digital reading.
- Source: `https://ucldigitalpress.co.uk/Book/Article/69/93/5183/`
- Placement: after the section explaining why personalization must connect to meaning, not just name insertion.

H2:

- Что такое персонализация, если это не просто имя в тексте
- Почему детям важно узнавать себя в истории
- Как любимая игрушка, питомец или брат становятся входом в сюжет
- Когда персонализация помогает, а когда мешает
- Как сделать ребенка героем, не превращая сказку в самолюбование
- Как WonderTales использует профили, персонажей и иллюстрации
- Идеи для первой персонализированной сказки

Cookbook-style page notes:

- Hero label: `ПЕРСОНАЛІЗАЦІЯ`
- Hero image: a child opening a book where their own character steps into a gentle fantasy world.
- Use 2-3 article section illustrations: favorite toy as hero, sibling/pet cameo, recurring hero series.
- Bottom CTA: create a story where the child or favorite toy becomes the hero.

Visual direction:

- Warm, personal, emotionally specific; avoid generic "child with book" stock feeling.

### 3. Age-Appropriate Story Complexity

Slug:

- `age-appropriate-story-complexity`

H1:

- Какой должна быть сказка для ребенка разного возраста

Parent problem:

- Parents do not know whether a story is too simple, too long, or too difficult.

Angle:

- Explain age adaptation through sentence length, vocabulary, repetition, suspense level, dialogue, and emotional safety.

Product connection:

- WonderTales adjusts story structure and language by age group.

Evidence:

- IES, NICHD, Lexile Hub.

Risk:

- Avoid claiming exact word counts or Lexile bands are official age standards.

Expert quote candidate:

- Quote: "Any subject can be taught effectively in some intellectually honest form to any child at any stage of development."
- Attribution: Jerome Bruner, psychologist; quote from `The Process of Education`.
- Source: `https://psychology.fas.harvard.edu/people/jerome-bruner`
- Placement: after explaining that age adaptation should simplify form without making the story empty.

H2:

- Почему возраст влияет не только на тему, но и на язык
- Что меняется: длина предложений, словарь, диалоги и темп
- Сказки для малышей: повторение, ритм и простые эмоции
- Сказки для 4-5 лет: мягкий конфликт и быстрое разрешение
- Сказки для 6-8 лет: приключение, выбор и новые слова
- Сказки для 9-12 лет: глубина, последствия и более сложный сюжет
- Почему точные цифры слов и Lexile — ориентир, а не закон

Cookbook-style page notes:

- Hero label: `ВІК І ТЕКСТ`
- Hero image: a staircase of story pages growing from simple picture-book scenes to richer chapter-like scenes.
- Use section cards for age bands, similar to cookbook catalog sections.
- Bottom CTA: pick a child's age and create an age-adapted story.

Visual direction:

- Educational but soft; avoid school-test visuals.

### 4. Audio Bedtime Stories

Slug:

- `audio-bedtime-stories`

H1:

- Как увлечь ребенка аудиосказкой на ночь

Parent problem:

- Parents want a calm no-screen option, but audio can become background noise.

Angle:

- Choose a calm moment, keep the story predictable, use a familiar hero, repeat favorite voices, and make audio part of a routine.

Product connection:

- One audio story per tale, narrator voice, read-along text.

Evidence:

- Bedtime routine research.

Risk:

- Do not promise better sleep.

Expert quote candidate:

- Quote: "taking statistics on the sounds they need to know"
- Attribution: Patricia Kuhl, language development researcher.
- Source: TED talk summary, `https://www.ted.com/talks/patricia_kuhl_the_linguistic_genius_of_babies`
- Verification note: use as a language-exposure support quote only; do not imply passive audio teaches language by itself.
- Placement: after the section on voice, repetition, and listening as part of a human bedtime routine.

H2:

- Почему аудиосказка работает не так, как видео
- Что делает вечернюю историю спокойной
- Как выбрать голос, темп и длину сказки
- Почему знакомый герой помогает ребенку слушать внимательнее
- Как сочетать аудио, текст и родительское участие
- Что делать, если ребенок отвлекается или просит экран
- Короткий ритуал аудиосказки перед сном

Cookbook-style page notes:

- Hero label: `АУДІО НА НІЧ`
- Hero image: audio waves becoming soft stars above a bed, with a small storybook glow.
- Include a practical routine block styled like a cookbook tip card.
- Bottom CTA: create an audio story for tonight.

Visual direction:

- Nighttime, calm, warm, no bright screen as the center of the image.

### 5. Five-Minute Stories Always At Hand

Slug:

- `five-minute-stories`

H1:

- 5-минутные сказки, которые всегда под рукой

Parent problem:

- Parents feel guilty when they cannot do a long bedtime reading session.

Angle:

- A short, warm story still counts. Consistency can matter more than duration.

Product connection:

- Fast story creation flow, saved stories, audio, reusable child profiles.

Evidence:

- Bedtime routine research and outreach insights.

Risk:

- Avoid making the parent feel inadequate.

Expert quote candidate:

- Quote: "Human beings were never born to read."
- Attribution: Maryanne Wolf, cognitive neuroscientist and reading researcher.
- Source: `https://www.maryannewolf.com/proust-and-the-squid`
- Placement: after explaining that short story moments can support reading culture without becoming formal reading instruction.

H2:

- Почему короткая сказка все равно считается настоящим чтением
- Когда родителю нужна быстрая история, а не идеальный ритуал
- Как выбрать тему за минуту
- Как ребенок может участвовать в создании истории
- Почему сохраненная библиотека снижает вечернюю усталость
- Как WonderTales помогает создать сказку без долгой подготовки
- Сценарии на каждый день: перед сном, в дороге, после сложного дня

Cookbook-style page notes:

- Hero label: `5 ХВИЛИН`
- Hero image: a pocket-sized glowing story door opening from a phone or book on a nightstand.
- Use scenario cards like cookbook recipe-category cards: bedtime, car ride, waiting room, after a hard day.
- Bottom CTA: create a 5-minute story.

Visual direction:

- Reassuring and practical; no guilt, no exhausted-parent drama.

### 6. Story Morals Without Lecturing

Slug:

- `story-morals-without-lecturing`

H1:

- Как добавить мораль в сказку без нравоучений

Parent problem:

- Parents want stories about friendship, patience, courage, or willpower, but children reject obvious preaching.

Angle:

- Put the value inside a choice, conflict, or small emotional moment.

Product connection:

- Moral selector: friendship, willpower, patience, courage, empathy, responsibility.

Evidence:

- CASEL SEL fundamentals.

Risk:

- Do not position moral stories as formal SEL instruction.

Expert quote candidate:

- Quote: "Emotions can either enhance or derail classroom performance."
- Attribution: Marc Brackett and coauthors, Yale Center for Emotional Intelligence / ASCD.
- Source: `https://www.ascd.org/el/articles/emotions-matter`
- Placement: after the section explaining why morals work better through emotion and choice than direct instruction.

H2:

- Почему дети сопротивляются прямым урокам
- Как мораль становится частью сюжета
- Дружба: показать выбор, а не объяснить правило
- Терпение и сила воли: маленькие шаги вместо героических подвигов
- Смелость: страх не исчезает, но герой действует
- Как обсудить мораль после сказки без допроса
- Как выбрать мораль в WonderTales

Cookbook-style page notes:

- Hero label: `МОРАЛЬ`
- Hero image: three warm lanterns represented by visual symbols for friendship, patience, and courage.
- Include one practical card: "Turn a moral into a plot choice."
- Bottom CTA: create a story with a chosen moral.

Visual direction:

- Story-first and emotional, not classroom/poster-like.

### 7. Reading Without Pressure

Slug:

- `reading-without-pressure`

H1:

- Как привить интерес к чтению без давления

Parent problem:

- Reading practice becomes pressure, correction, and resistance.

Angle:

- Separate skill practice from story pleasure. Use stories as motivation, not a test.

Product connection:

- Read-along mode, audio, personalized themes, child choice.

Evidence:

- IES and NICHD.

Risk:

- Do not claim WonderTales teaches decoding/phonics.

Expert quote candidate:

- Quote: "what a child can do with assistance today she will be able to do by herself tomorrow"
- Attribution: Lev Vygotsky, psychologist.
- Source: `https://home.fau.edu/musgrove/web/vygotsky1978.pdf`
- Placement: after separating supported story time from testing or correction.

H2:

- Почему чтение иногда превращается в борьбу
- Чем отличается тренировка чтения от любви к историям
- Как дать ребенку выбор и сохранить границы
- Почему перечитывание любимого — не шаг назад
- Как аудио и read-along помогают без ощущения теста
- Когда стоит оставить сложную книгу на потом
- Низкое давление, высокая регулярность: домашний чеклист

Cookbook-style page notes:

- Hero label: `БЕЗ ТИСКУ`
- Hero image: a child choosing between story doors, with a parent sitting nearby rather than correcting.
- Use alternating sections for "practice" vs "pleasure" without making it look like a school worksheet.
- Bottom CTA: create a low-pressure story together.

Visual direction:

- Gentle, freeing, no red pens or school-test symbols.

### 8. Bedtime Story As Family Ritual

Slug:

- `bedtime-story-family-ritual`

H1:

- Как превратить сказку на ночь в семейный ритуал

Parent problem:

- Bedtime stories can become another overstimulating activity instead of a calming ritual.

Angle:

- Repetition, familiar characters, voice, predictable endings, and small child-chosen details.

Product connection:

- Series stories, favorite heroes, audio replay, saved library.

Evidence:

- Bedtime routine research plus forum feedback.

Risk:

- Do not overuse illustrations as the main promise for bedtime; emphasize voice and imagination.

Expert quote candidate:

- Quote: "Establishment of a consistent bedtime routine is often recommended to parents of young children"
- Attribution: Jodi A. Mindell et al., sleep researchers.
- Source: `https://pmc.ncbi.nlm.nih.gov/articles/PMC2675894/`
- Placement: after the section on repetition, familiar voice, and predictable endings.

H2:

- Почему ритуал важнее длины истории
- Что делает сказку вечерней, а не возбуждающей
- Роль повторения: любимый герой, знакомый голос, предсказуемый финал
- Как добавить один новый элемент без перегруза
- Почему не каждая персонализированная история подходит для сна
- Как сохранить ритуал, когда у родителя мало сил
- Пример спокойного вечернего сценария

Cookbook-style page notes:

- Hero label: `РИТУАЛ`
- Hero image: a bed floating like a small boat on a calm star river, with story characters quietly nearby.
- Use a "ritual recipe" section, mirroring cookbook logic but for bedtime steps.
- Bottom CTA: continue a favorite hero series tonight.

Visual direction:

- Cozy, quiet, repetitive in a comforting way.

### 9. Child-Created Characters

Slug:

- `child-created-characters`

H1:

- Почему детям нравится создавать собственных персонажей

Parent problem:

- Children want control and imagination, especially around age 8-12.

Angle:

- Character creation gives children ownership while adults keep safe boundaries.

Product connection:

- Character builder, child photos/reference images, color choices, traits, interests.

Evidence:

- Personalization research and SEL framing around identity/choice.

Risk:

- Keep this child-friendly, not too adult/productivity-like.

Expert quote candidate:

- Quote: "What's innate in us is our capacity to learn and change."
- Attribution: Alison Gopnik, professor of psychology, UC Berkeley.
- Source: `https://onbeing.org/programs/alison-gopnik-the-evolutionary-power-of-children-and-teenagers/`
- Placement: after explaining character creation as exploration, not a form to fill out.

H2:

- Персонаж как способ ребенка сказать: "это мой мир"
- Что дети выбирают первыми: внешность, силы, характер или роль
- Почему варианты лучше пустых текстовых полей
- Как цвета, черты и интересы помогают AI понять героя
- Как сохранить безопасность и не ограничить фантазию
- Чем отличается персонаж для игры от персонажа для сказки
- Как начать с простого героя и развивать его в серии

Cookbook-style page notes:

- Hero label: `ПЕРСОНАЖ`
- Hero image: a child assembling a friendly creature from color swatches and soft magical shapes.
- Use visual cards for color, role, personality, power, and story fit.
- Bottom CTA: create a character and use it in a story.

Visual direction:

- Should feel usable and beautiful for a 10-year-old, not only for a parent.

### 10. Safe Scary Stories And Big Feelings

Slug:

- `safe-scary-stories`

H1:

- Как понять, насколько страшной может быть детская сказка

Parent problem:

- Children ask for spooky stories, but parents worry about nightmares or too much fear.

Angle:

- The right level depends on age: playful spooky, mystery, brief suspense, fast relief, positive ending.

Product connection:

- WonderTales has age-based scary-story boundaries and validation.

Evidence:

- CASEL for emotions; internal content policy for product rules.

Risk:

- External research may not validate our exact scare thresholds. Present product policy clearly as WonderTales' safety design.

Expert quote candidate:

- Quote: "emotions are information"
- Attribution: Marc Brackett, Yale Center for Emotional Intelligence.
- Source: `https://marcbrackett.com/wp-content/uploads/2025/02/Permission-To-Feel-Book-Discussion-Guide.pdf`
- Placement: after explaining that fear in stories should become a named, bounded feeling rather than a lingering threat.

H2:

- Почему дети просят страшные истории
- Чем отличается любопытное напряжение от настоящего испуга
- 4-5 лет: смешные тени и быстрое облегчение
- 6-8 лет: тайна, загадка и безопасный финал
- 9-12 лет: саспенс без травмы и жестокости
- Как говорить о страхе после истории
- Как WonderTales ограничивает страшные темы по возрасту

Cookbook-style page notes:

- Hero label: `СТРАШНО, АЛЕ БЕЗПЕЧНО`
- Hero image: friendly shadows turning into silly shapes under warm lamplight.
- Use age-band cards similar to cookbook sections.
- Bottom CTA: create a safe spooky story for the child's age.

Visual direction:

- Slightly mysterious, never horror-like, no frightening faces for young-child visuals.

## Content Structure Per Article

Each article should have:

- SEO title
- Meta description
- Canonical URL
- `hreflang` links for all seven locales plus `x-default`
- Open Graph title/description/image
- Article JSON-LD
- Breadcrumb JSON-LD
- Intro that names a real parent problem
- 4-6 useful sections
- Practical checklist
- Product mention only after useful context
- Short CTA to create a story
- Sources section with 3-5 links

## Implementation Shape

Suggested code structure:

- `services/api/src/ssr/blogContent.ts`
- `services/api/src/ssr/renderBlogArticleHtml.ts`
- `services/api/src/routes/ssrBlog.ts`
- `packages/shared/src/utils/routeOwnership.ts`
- `services/api/src/services/sitemapService.ts`
- `services/api/src/ssr/__tests__/renderBlogArticleHtml.test.ts`
- `services/api/src/ssr/__tests__/routeOwnership.test.ts`

Suggested routes:

- Blog index: `/blog`, `/:locale/blog`
- Article: `/blog/:slug`, `/:locale/blog/:slug`

Suggested sitemap:

- Blog index priority: `0.8`
- Blog article priority: `0.75`
- Change frequency: `weekly` or `monthly`

## Image Direction

Images should match the WonderTales landing style:

- Soft storybook illustration
- Warm light
- Calm magic
- Parent-child warmth without stock-photo feeling
- One clear emotional subject
- No medical, school-test, corporate SaaS, or generic marketing imagery
- No scary imagery for young-child topics
- No text embedded in images

Existing visual references:

- `apps/universal-app/public/landing/optimized/bedtime-moments-960.avif`
- `apps/universal-app/public/landing/optimized/personal-keepsake-960.webp`
- `apps/universal-app/public/landing/optimized/age-adaptation-960.webp`
- `apps/universal-app/public/landing/optimized/read-along-text-960.webp`
- `apps/universal-app/public/landing/optimized/favorite-hero-series-960.webp`

## Agent Handoff Rule

Do not send agents to write or create images until this foundation is approved.

After approval, split work like this:

1. Content agent: create article outlines and source-backed claims.
2. Translation agent: localize approved copy into `uk`, `en`, `ru`, `es`, `de`, `fr`, `pl`.
3. Visual agent: generate image briefs only after article angle is stable.
4. Implementation agent: add SSR routes, sitemap, metadata, and tests.

## Open Decisions

- Should blog default language be Ukrainian only at `/blog`, with English at `/en/blog`, matching current SEO route rules? Recommendation: yes.
- Should legal pages also be expanded to all seven languages? Separate decision.
- Should landing page Lexile copy be softened before publishing research-heavy blog content? Recommendation: yes.
- Should articles be generated as static code content or from database/admin CMS? Recommendation for first version: static typed content in code for quality control.
