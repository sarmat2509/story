import type { ImageAspectRatio, ReferenceImage } from '../providers/base/IImageProvider';

export function summarizeImageReferenceImages(
  referenceImages: ReferenceImage[]
): Array<Record<string, unknown>> {
  return referenceImages.map((ref, index) => {
    const meta = ref as ReferenceImage & {
      source?: string;
      type?: string;
      isTurnaround?: boolean;
      identitySource?: 'turnaround' | 'reference_photo' | 'dressed_turnaround';
      environmentId?: string;
      storagePath?: string;
    };

    return {
      index: index + 1,
      imageIndex: ref.imageIndex ?? index + 1,
      referenceBindingId: ref.referenceBindingId ?? null,
      characterName: ref.characterName ?? null,
      referenceKind: ref.referenceKind ?? null,
      source: meta.source ?? null,
      type: meta.type ?? null,
      environmentId: meta.environmentId ?? null,
      storagePath: meta.storagePath ?? null,
      url: ref.url ?? null,
      isTurnaround: ref.referenceKind === 'character' ? meta.isTurnaround === true : null,
      identitySource:
        ref.referenceKind === 'character'
          ? (meta.identitySource ?? (meta.isTurnaround ? 'turnaround' : 'reference_photo'))
          : null,
      hasFileUri: !!ref.fileUri,
      fileUri: ref.fileUri ?? null,
      hasBase64Data: !!ref.base64Data,
      base64Bytes: ref.base64Data ? Buffer.byteLength(ref.base64Data, 'base64') : null,
      instructionText: ref.instructionText ?? null,
    };
  });
}

export function buildImageRequestManifest(params: {
  operation: string;
  mode: 'generate' | 'edit';
  prompt: string;
  systemInstruction?: string;
  aspectRatio?: ImageAspectRatio;
  imageSize?: string;
  personGeneration?: 'allow_adult' | 'allow_all' | 'dont_allow';
  referenceImages?: ReferenceImage[];
  providerRequestManifest?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const referenceImages = params.referenceImages ?? [];
  const references = summarizeImageReferenceImages(referenceImages);
  const providerManifest = params.providerRequestManifest ?? {};
  return {
    version: 1,
    ...providerManifest,
    operation: params.operation,
    mode: params.mode,
    savedAt: new Date().toISOString(),
    aspectRatio: params.aspectRatio ?? providerManifest.aspectRatio ?? null,
    imageSize: params.imageSize ?? providerManifest.imageSize ?? null,
    personGeneration: params.personGeneration ?? providerManifest.personGenerationRequested ?? null,
    prompt: params.prompt,
    systemInstruction: params.systemInstruction ?? null,
    promptLength: params.prompt.length,
    systemInstructionLength: params.systemInstruction?.length ?? 0,
    referenceCount: references.length,
    characterReferenceCount: references.filter((ref) => ref.referenceKind === 'character').length,
    objectReferenceCount: references.filter((ref) => ref.referenceKind === 'object').length,
    referenceImages: references,
  };
}

export function annotateImageRequestManifest(
  manifest: unknown,
  params: {
    providerRoute?: string;
    provider?: string;
    model?: string;
    providerInteractionId?: string | null;
  }
): Record<string, unknown> | null {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  return {
    ...(manifest as Record<string, unknown>),
    providerRoute: params.providerRoute ?? null,
    provider: params.provider ?? null,
    model: params.model ?? null,
    providerInteractionId:
      params.providerInteractionId ??
      ((manifest as Record<string, unknown>).providerInteractionId as string | null | undefined) ??
      null,
  };
}

export function compactImageRequestManifests(...manifests: unknown[]): Record<string, unknown>[] {
  return manifests.filter(
    (manifest): manifest is Record<string, unknown> =>
      !!manifest && typeof manifest === 'object' && !Array.isArray(manifest)
  );
}
