---
name: wondertales-blog-article
description: Create or update WonderTales SSR blog articles in this repository. Use when adding practical parent-facing blog posts, changing `services/api/src/ssr/blogContent.ts` or `renderBlogHtml.ts`, adding evidence-informed parenting/learning content tied to app functionality, localizing blog article fields, creating blog illustration briefs, or optimizing blog images for `apps/universal-app/public/landing/blog`.
---

# WonderTales Blog Article

## Overview

Use this skill to add practical, evidence-informed WonderTales blog articles that map directly to app functionality. A good article gives parents concrete actions, cites credible child development or learning specialists, and avoids vague marketing.

## Workflow

1. Read the current blog structure before editing:
   - `services/api/src/ssr/blogContent.ts`
   - `services/api/src/ssr/renderBlogHtml.ts`
   - `services/api/src/ssr/__tests__/renderBlogHtml.test.ts`
   - `apps/universal-app/public/landing/blog/`
2. Draft the article text first. Do not generate or optimize illustrations until the text, angle, slug, and scene briefs are stable.
3. Ground the article in credible sources:
   - Prefer primary papers, official professional organizations, or specialist centers.
   - Use the sources to support practical guidance, not to decorate the article.
   - Avoid medical, diagnostic, or therapeutic promises.
4. When mentioning an app feature, verify the shipped UX name in code before writing:
   - Search app components and `packages/shared/src/i18n/*.json` for the exact labels.
   - Use the localized UI label in article text when helpful, for example a real tab or section name.
   - Do not invent feature names such as "discuss with parent" if the product label says something else.
5. Add the article definition in `blogContent.ts` with all required locales: `uk`, `en`, `ru`, `es`, `de`, `fr`, `pl`.
6. Add or update tests after changing published article count, slugs, or required rendering behavior.
7. Create blog images as a separate pass after text generation. Save originals, optimize for web, then reference only committed optimized paths from article data.
8. Run the focused SSR blog test.

## Article Contract

Each article should include:

- A specific app feature or use case, not a generic parenting topic.
- A parent problem stated plainly.
- Practical advice in the four existing sections:
  - why it matters
  - what research and practice suggest
  - how to use it in a story
  - when to adjust
- One quote card tied to a specialist or credible organization.
- `sources` with stable URLs, even though the current renderer does not print a public sources section.
- `checklist` items parents can try immediately.
- Optional `insightCards`, `decisionTable`, and `stepBlock` when they add concrete guidance.
- Specialist names must include affiliation or institutional context on first mention: university, research center, professional organization, or company. Translate institution names and specialist roles into the target locale in localized article text and quote-card bios. Avoid raw English academic terms such as `retrieval practice`, `feedback`, or `graphic novels` in non-English locales; translate the concept and add the English term only when it is necessary for source traceability.

Feature-first framing:

- Do not structure the article as a generic parent checklist that starts with “try doing 1, 2, 3.” Lead with the parenting problem, the specialist view, and how WonderTales already handles the pattern through shipped product behavior.
- Prefer this flow: “WonderTales does X, which helps with Y and Z; parents can then use it by doing 1, 2, 3 around the story.” Parent actions should feel like ways to use the product well, not standalone advice that could appear in any parenting blog.
- In `storyUse`, `checklist`, `decisionTable`, and `stepBlock`, name the WonderTales mechanism first when possible: story format, child profile, character setup, text size, audio, quizzes, rewards, sharing, or another verified UX element. Then describe the parent’s light-touch role.
- When using an exact UI label, name the surface or moment where it appears, especially if the label is generic out of context. For example, write “in the after-story quiz, ‘Text clue’...” rather than only “‘Text clue’...”.
- Feature-first does not mean product-heavy. The article must still teach the parenting or learning principle in concrete terms; WonderTales should appear as the practical place where the principle becomes easier to use, not as repeated marketing copy.

Tone rules:

- Write for parents, not for academics.
- Make every paragraph useful: examples, boundaries, decision rules, or app usage.
- Tie advice to WonderTales features that exist in the codebase or product copy.
- Write about shipped WonderTales functionality as already available to parents. Do not frame product behavior as “should be built”, “better to make”, or “the app should”; instead explain the parenting problem, the specialist view, and how WonderTales already helps through the relevant feature.
- Do not call quizzes tests or grades when the UX is meant to feel playful.
- Do not overclaim causality from a single study.

## Localization

The blog data is fully localized. For every new article, fill every localized field instead of relying on English fallback:

- `category`
- `title`
- `description`
- `lead`
- `focus`
- `research`
- `storyUse`
- `adjustment`
- `checklist`
- localized `quote.text` and `quote.sourceLabel`
- inline image `alt` and `caption` if inline images are used

Use clear native phrasing. It is better to make a short natural sentence than a literal translation that feels stiff.

## Illustration Rules

Generate blog illustrations only after the article text is final enough to brief scenes.

Required image set for an article:

- `scene-01`: required hero/card image
- `scene-02` and `scene-03`: optional inline/supporting images only when they show genuinely different moments, advice, or app states. Do not create near-duplicate images just to fill the old three-scene pattern.

Storage:

- Keep the original generated illustration in `apps/universal-app/public/landing/blog/originals/<slug>-scene-XX.png`.
- Commit optimized web images in `apps/universal-app/public/landing/blog/<slug>-scene-XX.webp`.
- Reference optimized web paths in `blogContent.ts`, for example `/landing/blog/<slug>-scene-01.webp`.
- Do not reference files that exist only under `$CODEX_HOME/generated_images`.

Dimensions and format:

- Source/original: landscape 16:9 PNG, at least `1792x1024`; prefer `2048x1152` when available.
- Web output: `1536x864` WebP, quality about `82`, cropped with `cover` if needed.
- Avoid in-image text; localized page text belongs in HTML.

Style:

- Match the existing WonderTales blog look: warm storybook watercolor or soft digital watercolor, cozy family scenes, gentle golden/violet lighting, expressive but realistic children and parents, polished editorial composition.
- Show a tablet as the story surface instead of a paper book. A book should not be the primary reading object unless the article explicitly compares formats; even then, the tablet must remain visible as the WonderTales medium.
- For tablet quiz/item-choice scenes, define orientation from the child's point of view. The bottom edge of the tablet is closest to the child. If horse, dragon, crown, or sword icons/items appear: horse and dragon must face with paws/hooves toward the child, crown must have its base toward the child, and sword must have its handle/hilt toward the child.
- No logos, no UI copy, no readable text, no watermarks.
- Keep composition readable when cropped to article cards (`16:10`) and article hero (`16:8`).

Optimize originals with:

```bash
node .codex/skills/wondertales-blog-article/scripts/optimize_blog_images.js <slug>
```

## Validation

Run at least:

```bash
pnpm --filter wondertales-api exec tsx src/ssr/__tests__/renderBlogHtml.test.ts
```

Also check that every referenced `/landing/blog/*.webp` exists and is `1536x864`. Remove unreferenced generated blog images unless the user asked to keep alternates.
