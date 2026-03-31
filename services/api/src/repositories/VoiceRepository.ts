import { eq, and, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { getLocalizedVoiceDisplayName, getVoiceSamplePath } from '../utils/voicePresentation';

export class VoiceRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findActiveByLanguage(language: string): Promise<Array<{
    id: string;
    providerVoiceId: string;
    name: string;
    displayName: string;
    gender: string | null;
    description: string | null;
    previewUrl: string | null;
    sampleAudioUrl: string | null;
    isPremium: boolean;
    provider: string;
  }>> {
    const voices = await this.db
      .select({
        id: schema.ttsVoices.id,
        providerVoiceId: schema.ttsVoices.providerVoiceId,
        name: schema.ttsVoices.name,
        displayName: schema.ttsVoices.displayName,
        gender: schema.ttsVoices.gender,
        description: schema.ttsVoices.description,
        previewUrl: schema.ttsVoices.providerPreviewUrl,
        sampleAudioUrl: schema.ttsVoices.sampleAudioUrl,
        isPremium: schema.ttsVoices.isPremium,
        provider: schema.ttsVoices.provider,
      })
      .from(schema.ttsVoices)
      .where(eq(schema.ttsVoices.isActive, true))
      .orderBy(schema.ttsVoices.isPremium, schema.ttsVoices.name);

    return voices.map((voice) => ({
      ...voice,
      displayName: getLocalizedVoiceDisplayName(voice.name, language, voice.displayName),
      sampleAudioUrl: getVoiceSamplePath(voice.providerVoiceId, language),
    }));
  }

  async findByProviderVoiceId(
    provider: string,
    providerVoiceId: string
  ): Promise<schema.TtsVoice | null> {
    const [voice] = await this.db
      .select()
      .from(schema.ttsVoices)
      .where(and(
        eq(schema.ttsVoices.provider, provider),
        eq(schema.ttsVoices.providerVoiceId, providerVoiceId)
      ))
      .limit(1);
    return voice || null;
  }

  async findById(id: string): Promise<schema.TtsVoice | null> {
    const [voice] = await this.db
      .select()
      .from(schema.ttsVoices)
      .where(eq(schema.ttsVoices.id, id))
      .limit(1);
    return voice || null;
  }

  async findAllActive(): Promise<schema.TtsVoice[]> {
    return this.db
      .select()
      .from(schema.ttsVoices)
      .where(eq(schema.ttsVoices.isActive, true));
  }

  /**
   * Find voices matching role/language/gender filters, optionally joined with age groups.
   * Used by AudioDomainService for voice selection.
   */
  async findForSelection(params: {
    language: string;
    role: string;
    characterGender?: string | null;
    ageGroupId?: string | null;
  }): Promise<Array<{
    id: string;
    providerVoiceId: string;
    name: string;
    language: string;
    gender: string | null;
    ageCategory: string | null;
    voiceTags: string[] | null;
    description: string | null;
    providerPreviewUrl: string | null;
    isPremium: boolean;
    roleType: string | null;
  }>> {
    const filters: any[] = [
      eq(schema.ttsVoices.isActive, true),
      or(
        eq(schema.ttsVoices.roleType, params.role),
        eq(schema.ttsVoices.roleType, 'both')
      )!,
    ];

    if (params.role === 'character' && params.characterGender) {
      filters.push(eq(schema.ttsVoices.gender, params.characterGender));
    }

    let query = this.db
      .select({
        id: schema.ttsVoices.id,
        providerVoiceId: schema.ttsVoices.providerVoiceId,
        name: schema.ttsVoices.name,
        language: schema.ttsVoices.language,
        gender: schema.ttsVoices.gender,
        ageCategory: schema.ttsVoices.ageCategory,
        voiceTags: schema.ttsVoices.voiceTags,
        description: schema.ttsVoices.description,
        providerPreviewUrl: schema.ttsVoices.providerPreviewUrl,
        isPremium: schema.ttsVoices.isPremium,
        roleType: schema.ttsVoices.roleType,
      })
      .from(schema.ttsVoices);

    if (params.ageGroupId) {
      query = query
        .innerJoin(schema.voiceAgeGroups, eq(schema.voiceAgeGroups.voiceId, schema.ttsVoices.id))
        .where(and(...filters, eq(schema.voiceAgeGroups.ageGroupId, params.ageGroupId))) as any;
    } else {
      query = query.where(and(...filters)) as any;
    }

    return query;
  }

  async findFallbackByLanguage(_language: string): Promise<schema.TtsVoice | null> {
    const [voice] = await this.db
      .select()
      .from(schema.ttsVoices)
      .where(eq(schema.ttsVoices.isActive, true))
      .limit(1);
    return voice || null;
  }
}
