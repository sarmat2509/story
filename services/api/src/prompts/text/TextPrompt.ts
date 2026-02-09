/**
 * Text Generation Prompt Builder
 * Generates prompts for full story text generation based on outline
 */

import * as helpers from '../helpers';
import type { StorySpec, EpisodeOutline } from '../../ai/types';
import { AUDIO_TAGS } from '../../constants/audioTags';

export interface TextPromptParams {
  spec: StorySpec;
  outline: EpisodeOutline;
  vocabLevel: string; // simple, basic, intermediate, advanced
}

/**
 * Build text generation prompt
 * 
 * Takes an outline and generates complete text for each scene,
 * following readability guidelines, vocabulary levels, and safety policies.
 */
export function buildTextPrompt(params: TextPromptParams): string {
  const { spec, outline, vocabLevel } = params;
  
  return helpers.cleanTemplate`
You are a creative storyteller specializing in children's content with audio narration support.
Generate expressive text with ElevenLabs v3 audio tags for natural, engaging spoken delivery.

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

OUTLINE:
${JSON.stringify(outline, null, 2)}

${helpers.formatSupportingCharacters(spec)}

WRITING REQUIREMENTS:
- Age group: ${spec.ageGroup}
- Vocabulary level: ${vocabLevel}

${helpers.formatAgeRequirements(spec.ageGroup)}

${spec.scenarioCard?.id === 'scary_stories' ? helpers.formatScaryStoryRequirements(spec.ageGroup) : ''}

${helpers.formatSafetyPolicy(spec.policyProfile)}

${helpers.formatWritingStyle(spec, vocabLevel)}

OUTPUT FORMAT (JSON):
{
  "title": "${outline.title}",
  "language": "${spec.language}",
  "environments": [
    {
      "id": "short_id",
      "name": "Human-readable location name",
      "visualDescription": "Rich visual description of the location IN ENGLISH: layout, furniture, objects, colors, baseline lighting, atmosphere."
    }
  ],
  "scenes": [
    {
      "sceneId": 1,
      "environmentId": "short_id",
      "text": "Full scene text (1-3 paragraphs) with embedded ElevenLabs v3 audio tags for expressive narration.",
      "visualPrompt": "Action-focused description IN ENGLISH: character poses, expressions, interactions, transient changes. Do NOT describe the room/location here.",
      "characters": ["Character Name 1", "Character Name 2"],
      "visualCharacters": ["Character Name 1"]
    }
  ]
}

CRITICAL - Environments:
- Define ALL distinct physical locations in "environments" array
- "visualDescription" MUST be in English: describe room layout, furniture, objects, colors, baseline lighting, atmosphere
- Be DETAILED and SPECIFIC - this is the only source of setting details for image generation
- Multiple scenes can share the same environmentId. Only create a new environment when the physical location changes.

CRITICAL - visualPrompt vs environment:
- "visualPrompt" describes ONLY the ACTION: character poses, expressions, interactions, transient changes (weather, lighting, new objects)
- "visualPrompt" MUST be in English for image generation
- Do NOT repeat the room/location in visualPrompt — that comes from the environment

CRITICAL - Characters Per Scene:
- "characters": list ALL character names that appear or are mentioned in that scene's text
- "visualCharacters": list ONLY characters who are PHYSICALLY PRESENT in the scene and should be DRAWN in the illustration
  - Include characters who are in the scene location, performing actions, interacting
  - EXCLUDE characters merely mentioned in dialogue, thoughts, or memories (e.g. if a character says "Remember what Grandma told us?" — Grandma is NOT a visual character unless she is physically in the scene)
- Use EXACT names from the SUPPORTING CHARACTERS section above (if any)
- If scene has no characters (e.g., pure description), use empty arrays
- These lists are used for visual consistency in image generation, so accuracy is critical

AUDIO TAGS USAGE:
Integrate audio tags in square brackets [tag] to enhance emotional delivery for text-to-speech.
Use EXACTLY the official ElevenLabs v3 formats below (case-sensitive, lowercase only).

OFFICIAL SUPPORTED TAGS:
Emotions: [happy], [sad], [excited], [angry], [thoughtful], [curious], [surprised], [annoyed]
Delivery: [whisper], [shouting], [sarcastic], [mischievously]
Non-verbal: [laughing], [chuckles], [sighs], [clears throat], [exhales sharply], [inhales deeply]
Timing: [short pause], [long pause]

CRITICAL - Tag Format Rules:
- Use EXACT formats above (NOT [whispers], [giggles], [gasps] - these will be spoken literally!)
- Lowercase only (NOT [WHISPER] or [Whisper])
- Place tags before/after dialogue segments or at natural pauses
- Use 2-3 tags per scene maximum for natural flow

Examples:
- '[excited] Look at that beautiful sunset!'
- 'She opened the door slowly. [exhales sharply] The room was filled with treasure!'
- '[laughing] This is so much fun! [excited] Let\'s try again!'

SAFETY: Only use child-appropriate audio tags from approved list above. Avoid scary sounds ([gunshot], [explosion]), aggressive emotions. Prefer gentle, playful tags like [chuckles], [laughing], [excited], [whisper], [curious].

Use tags naturally to enhance storytelling emotion without overusing them.

IMPORTANT - Scene Structure:
- Write complete, standalone text for EACH scene with audio tags embedded
- Each scene should be 1-3 paragraphs depending on age
- Visual prompts describe ACTIONS and transient changes (not the setting — that comes from environment)
- Environment visualDescription describes the PERSISTENT SETTING of each location

CRITICAL - Scene Text Boundaries:
- Each scene's "text" MUST end at a complete sentence boundary (period, exclamation mark, or question mark followed by any closing quotes)
- NEVER split a sentence across two scenes — every sentence must belong entirely to one scene
- Do NOT start a new sentence at the end of a scene that continues in the next scene
`;
}
