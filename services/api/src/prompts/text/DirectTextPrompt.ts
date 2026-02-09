/**
 * Direct Text Generation Prompt (without outline)
 * Generates complete story text directly, including scene structure
 */

import * as helpers from '../helpers';
import type { StorySpec } from '../../ai/types';
import { AUDIO_TAGS } from '../../constants/audioTags';

export interface DirectTextPromptParams {
  spec: StorySpec;
  sceneCount: number;
  vocabLevel: string;
}

/**
 * Build direct text generation prompt
 * Skips outline generation and creates full story in one step
 */
export function buildDirectTextPrompt(params: DirectTextPromptParams): string {
  const { spec, sceneCount, vocabLevel } = params;
  
  return helpers.cleanTemplate`
You are a creative storyteller specializing in children's content with audio narration.
Generate a complete story directly with all scenes, text, and visual descriptions.

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

${helpers.formatChildProfile(spec)}

${helpers.formatSupportingCharacters(spec)}

STORY REQUIREMENTS:
${helpers.formatStoryRequirements({ spec, sceneCount })}

${helpers.formatAgeRequirements(spec.ageGroup)}

${spec.scenarioCard?.id === 'scary_stories' ? helpers.formatScaryStoryRequirements(spec.ageGroup) : ''}

${helpers.formatSafetyPolicy(spec.policyProfile)}

${helpers.formatWritingStyle(spec, vocabLevel)}

OUTPUT FORMAT (JSON):
{
  "title": "Story title in ${spec.language}",
  "language": "${spec.language}",
  "environments": [
    {
      "id": "short_id",
      "name": "Human-readable location name",
      "visualDescription": "Rich visual description of the location IN ENGLISH: layout, furniture, objects, colors, baseline lighting, atmosphere. Be detailed and specific."
    }
  ],
  "characters": [
    {
      "name": "Character name",
      "type": "human | animal | creature | object",
      "description": "Detailed visual appearance: size, colors, distinctive features, clothing/accessories. Be specific and consistent.",
      "role": "protagonist | sidekick | mentor | helper | guide | friend",
      "personality": "Key personality traits"
    }
  ],
  "moral": "The moral/lesson of the story",
  "scenes": [
    {
      "sceneId": 1,
      "environmentId": "short_id",
      "text": "Full scene text (1-3 paragraphs) with embedded ElevenLabs v3 audio tags for expressive narration.",
      "visualPrompt": "Action-focused description IN ENGLISH: character poses, expressions, interactions, transient changes (weather shift, new object). Do NOT describe the room/location here.",
      "characters": ["Character Name 1", "Character Name 2"],
      "visualCharacters": ["Character Name 1"]
    }
  ]
}

CRITICAL - Characters Per Scene:
- "characters": list ALL character names that appear or are mentioned in that scene's text
- "visualCharacters": list ONLY characters who are PHYSICALLY PRESENT in the scene and should be DRAWN in the illustration
  - Include characters who are in the scene location, performing actions, interacting
  - EXCLUDE characters merely mentioned in dialogue, thoughts, or memories (e.g. if a character says "Remember what Grandma told us?" — Grandma is NOT a visual character unless she is physically in the scene)
- Use EXACT names from the "characters" array above AND from SUPPORTING CHARACTERS section (if any)
- If scene has no characters, use empty arrays
- These lists are used for visual consistency in image generation, so accuracy is critical

CRITICAL - Environments:
- "environments": define ALL distinct physical locations in the story
- Each environment has a short "id" (e.g. "bedroom", "forest_clearing", "school_yard"), a "name", and a "visualDescription"
- "visualDescription" MUST be in English and describe the PERSISTENT setting: room layout, furniture, objects on shelves/walls, floor material, window placement, baseline lighting, atmosphere
- Be DETAILED and SPECIFIC - this is the only source of setting details for image generation
- Example good visualDescription: "A cozy cluttered workshop with a large wooden workbench covered in tools, colorful wires and gears scattered around, blueprints pinned to the walls, glass jars with spare parts on wooden shelves, a large window on the right wall, warm amber lamp light from a desk lamp, stone floor with a small round rug"
- Example bad visualDescription: "A workshop" (too vague, images will lack setting details)
- Multiple scenes can share the same environmentId. Only create a new environment when the physical location truly changes.
- If the scene takes place during a transition (e.g. walking between two places), create a separate environment for the transition location.

CRITICAL - visualPrompt vs environment:
- "visualPrompt" describes ONLY the ACTION happening in the scene: character poses, expressions, interactions, what they are doing, transient changes (weather shift, lighting change, new objects introduced by the plot)
- "visualPrompt" MUST be in English for image generation
- Do NOT repeat the room/location description in visualPrompt — that comes from the environment
- Example good visualPrompt: "Emilia sits at the workbench examining a blueprint with a magnifying glass. Rabbit perches next to her, ears perked up. Bright daylight streams through the window."
- Example bad visualPrompt: "A cozy workshop with tools. Emilia sits at the workbench..." (repeats the environment)

IMPORTANT - Character Descriptions:
- Return ALL characters you create in the story (do NOT include user-provided characters from SUPPORTING CHARACTERS section above)
- If no new characters are created (story only uses user-provided characters), return empty array []
- Provide DETAILED visual descriptions (appearance, colors, size, distinctive features, clothing)
- Be SPECIFIC and CONSISTENT - describe exactly how the character looks for image generation
- Example good description: "Small fluffy creature with purple fur, large golden eyes, translucent butterfly wings with star patterns, wears a tiny silver crown"
- Example bad description: "Cute helper" (too vague, will generate inconsistent images)
- These descriptions will be used for image generation to maintain character consistency across all scenes

AUDIO TAGS USAGE:
Integrate audio tags in square brackets [tag] to enhance emotional delivery.
Use EXACTLY the official ElevenLabs v3 formats below (case-sensitive, lowercase only).

OFFICIAL SUPPORTED TAGS:
Emotions: [happy], [sad], [excited], [angry], [thoughtful], [curious], [surprised], [annoyed]
Delivery: [whisper], [shouting], [sarcastic], [mischievously]
Non-verbal: [laughing], [chuckles], [sighs], [clears throat], [exhales sharply], [inhales deeply]
Timing: [short pause], [long pause]

CRITICAL - Tag Format Rules:
- Use EXACT formats above (NOT [whispers], [giggles], [gasps] - these will be spoken literally!)
- Lowercase only (NOT [WHISPER] or [Whisper])
- Place tags before/after dialogue or at natural pauses
- Maximum 2-3 tags per scene for natural flow

Examples:
- '[excited] Look at that beautiful sunset!'
- 'She opened the door slowly. [exhales sharply] The room was filled with treasure!'
- '[laughing] This is so much fun! [excited] Let\'s try again!'

SAFETY: Only use child-appropriate audio tags from approved list above. Avoid scary sounds. Prefer gentle, playful tags like [chuckles], [laughing], [excited], [whisper], [curious].

IMPORTANT:
- Write exactly ${sceneCount} scenes total
- Each scene should be 1-3 paragraphs depending on age group
- Visual prompts describe ACTIONS and transient changes (not HOW to draw or the setting)
- Environment visualDescription describes the PERSISTENT SETTING of the location
- Focus on positive, empowering storytelling
- Happy, safe ending required
- Include audio tags naturally in dialogue and narration

CRITICAL - Scene Text Boundaries:
- Each scene's "text" MUST end at a complete sentence boundary (period, exclamation mark, or question mark followed by any closing quotes)
- NEVER split a sentence across two scenes — every sentence must belong entirely to one scene
- Do NOT start a new sentence at the end of a scene that continues in the next scene
`;
}
