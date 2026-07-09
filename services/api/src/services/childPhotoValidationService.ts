import type { ITextProvider } from '../providers/base/ITextProvider';
import type { JsonSchema } from '../providers/base/JsonSchema';
import type { UsageMetadata } from '../providers/base/UsageMetadata';
import { getAssetStorageService } from './assetStorageService';
import { imageMimeTypeFromPath, normalizeImageMimeType } from '../utils/imageMimeType';
import { logger } from '../utils/logger';

export const CHILD_PHOTO_REQUIRES_HUMAN_CODE = 'CHILD_PHOTO_REQUIRES_HUMAN';
export const CHILD_PHOTO_REQUIRES_HUMAN_MESSAGE =
  'Sorry, we cannot create a profile with this photo. Please upload a photo of a child.';

type ChildPhotoPrimarySubject =
  | 'human'
  | 'animal'
  | 'toy'
  | 'object'
  | 'drawing'
  | 'unclear';

export interface ChildPhotoHumanPresenceResult {
  hasHumanSubject: boolean;
  humanSubjectCount: number;
  primarySubject: ChildPhotoPrimarySubject;
  confidence: number;
  reason: string;
}

export interface ChildPhotoValidationOptions {
  onUsage?: (usage: UsageMetadata) => void;
}

type SupportedVisionMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export class ChildPhotoValidationError extends Error {
  readonly statusCode = 400;
  readonly code = CHILD_PHOTO_REQUIRES_HUMAN_CODE;
  readonly index?: number;
  readonly validation?: ChildPhotoHumanPresenceResult;

  constructor(params: { index?: number; validation?: ChildPhotoHumanPresenceResult } = {}) {
    super(CHILD_PHOTO_REQUIRES_HUMAN_MESSAGE);
    this.name = 'ChildPhotoValidationError';
    this.index = params.index;
    this.validation = params.validation;
  }
}

export function isChildPhotoValidationError(error: unknown): error is ChildPhotoValidationError {
  return error instanceof ChildPhotoValidationError;
}

const CHILD_PHOTO_HUMAN_PRESENCE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hasHumanSubject: {
      type: 'boolean',
      description:
        'True only when at least one real visible human person is a clear subject of the uploaded image.',
    },
    humanSubjectCount: {
      type: 'integer',
      minimum: 0,
      maximum: 20,
      description:
        'Count only clear human subjects. Do not count dolls, toys, pets, statues, drawings, tiny background people, or reflections.',
    },
    primarySubject: {
      type: 'string',
      enum: ['human', 'animal', 'toy', 'object', 'drawing', 'unclear'],
      description: 'The main visible subject category of the image.',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence that the human-subject decision is correct.',
    },
    reason: {
      type: 'string',
      maxLength: 300,
      description: 'Short, non-sensitive explanation of the decision.',
    },
  },
  required: ['hasHumanSubject', 'humanSubjectCount', 'primarySubject', 'confidence', 'reason'],
};

const CHILD_PHOTO_HUMAN_PRESENCE_PROMPT = [
  'Inspect the uploaded image for child profile creation.',
  'Task: decide whether the image contains at least one real, visible human person as a clear subject.',
  'Do not identify anyone. Do not infer name, gender, exact age, relationship, ethnicity, or identity.',
  'Return hasHumanSubject=true only when a human person is clearly visible as a subject of the image.',
  'Return hasHumanSubject=false when the image contains only animals/pets, toys, dolls, objects, landscapes, screenshots, fictional creatures, or drawings/cartoons with no real visible person.',
  'Return hasHumanSubject=false when a person appears only as a tiny background detail, reflection, printed pattern, poster, or screen image.',
  'When uncertain, set hasHumanSubject=false, primarySubject="unclear", and explain the uncertainty briefly.',
  'Return only the requested JSON fields.',
].join('\n');

function normalizeSupportedVisionMimeType(mimeType?: string): SupportedVisionMimeType {
  const normalized = normalizeImageMimeType(mimeType);
  if (
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/webp' ||
    normalized === 'image/gif'
  ) {
    return normalized;
  }
  return 'image/jpeg';
}

function normalizeResult(
  raw: Partial<ChildPhotoHumanPresenceResult> | null | undefined
): ChildPhotoHumanPresenceResult {
  const source = raw ?? {};
  const primarySubjects: ChildPhotoPrimarySubject[] = [
    'human',
    'animal',
    'toy',
    'object',
    'drawing',
    'unclear',
  ];
  const primarySubject = primarySubjects.includes(
    source.primarySubject as ChildPhotoPrimarySubject
  )
    ? (source.primarySubject as ChildPhotoPrimarySubject)
    : 'unclear';
  const humanSubjectCount = Number.isFinite(source.humanSubjectCount)
    ? Math.max(0, Math.floor(source.humanSubjectCount as number))
    : 0;
  const confidence = Number.isFinite(source.confidence)
    ? Math.max(0, Math.min(1, source.confidence as number))
    : 0;

  return {
    hasHumanSubject: source.hasHumanSubject === true,
    humanSubjectCount,
    primarySubject,
    confidence,
    reason: typeof source.reason === 'string' ? source.reason.slice(0, 300) : '',
  };
}

function isAcceptableChildProfilePhoto(result: ChildPhotoHumanPresenceResult): boolean {
  return (
    result.hasHumanSubject &&
    result.humanSubjectCount > 0 &&
    result.primarySubject === 'human' &&
    result.confidence >= 0.65
  );
}

export class ChildPhotoValidationService {
  constructor(
    private readonly textProvider: ITextProvider,
    private readonly visionModel: string
  ) {}

  async validateBuffer(
    input: {
      imageData: Buffer;
      mimeType?: string;
      index?: number;
      source?: string;
      userId?: string;
    },
    options?: ChildPhotoValidationOptions
  ): Promise<ChildPhotoHumanPresenceResult> {
    const mimeType = normalizeSupportedVisionMimeType(input.mimeType);

    const result = normalizeResult(
      await this.textProvider.generateStructured<ChildPhotoHumanPresenceResult>({
        model: this.visionModel,
        prompt: CHILD_PHOTO_HUMAN_PRESENCE_PROMPT,
        schema: CHILD_PHOTO_HUMAN_PRESENCE_SCHEMA,
        imageData: [
          {
            mimeType,
            data: input.imageData.toString('base64'),
          },
        ],
        temperature: 0,
        relaxedSafety: true,
        onUsage: options?.onUsage,
        operation: 'image_validation_child_photo',
      })
    );

    logger.info(
      {
        userId: input.userId,
        source: input.source,
        index: input.index,
        hasHumanSubject: result.hasHumanSubject,
        humanSubjectCount: result.humanSubjectCount,
        primarySubject: result.primarySubject,
        confidence: result.confidence,
      },
      'Child profile photo human-presence validation completed'
    );

    return result;
  }

  async assertBufferContainsHuman(
    input: {
      imageData: Buffer;
      mimeType?: string;
      index?: number;
      source?: string;
      userId?: string;
    },
    options?: ChildPhotoValidationOptions
  ): Promise<ChildPhotoHumanPresenceResult> {
    const result = await this.validateBuffer(input, options);
    if (!isAcceptableChildProfilePhoto(result)) {
      logger.warn(
        {
          userId: input.userId,
          source: input.source,
          index: input.index,
          primarySubject: result.primarySubject,
          confidence: result.confidence,
          reason: result.reason,
        },
        'Child profile photo rejected because no clear human subject was detected'
      );
      throw new ChildPhotoValidationError({ index: input.index, validation: result });
    }
    return result;
  }

  async assertUploadedPhotosContainHumans(
    input: {
      storagePaths: string[];
      userId: string;
      source: string;
    },
    options?: ChildPhotoValidationOptions
  ): Promise<void> {
    const storageService = getAssetStorageService();
    for (let index = 0; index < input.storagePaths.length; index++) {
      const storagePath = input.storagePaths[index];
      const imageData = await storageService.getAssetByPath(storagePath);
      await this.assertBufferContainsHuman(
        {
          imageData,
          mimeType: imageMimeTypeFromPath(storagePath, 'image/jpeg'),
          index,
          source: input.source,
          userId: input.userId,
        },
        options
      );
    }
  }
}
