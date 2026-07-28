import type { AdminStoryValidationItem } from '@/admin/api/admin';

export type AdminImageGenerationKind = 'generate' | 'edit' | 'unknown';

export type AdminImageGenerationAttempt = {
  generationIndex: number;
  sceneIndex: number;
  pageNumber?: number | null;
  panelIndex?: number | null;
  panelId?: string | null;
  cropRect?: unknown | null;
  kind: AdminImageGenerationKind;
  label: string;
  imageUrl: string | null;
  imageStoragePath: string | null;
  validation: AdminStoryValidationItem | null;
  validationMissingReason: string | null;
  requests: Record<string, unknown>[];
  rawManifest: Record<string, unknown>;
  modelRawManifest: Record<string, unknown>;
  validationRawManifest: Record<string, unknown> | null;
  summary: {
    operation: string | null;
    mode: string | null;
    model: string | null;
    promptChars: number | null;
    referenceCount: number | null;
    requestCount: number;
  };
};

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && !Array.isArray(item)
      )
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cropRectKey(value: unknown): string | null {
  const record = recordOrNull(value);
  if (!record) return null;
  const left = numericValue(record.left);
  const top = numericValue(record.top);
  const width = numericValue(record.width);
  const height = numericValue(record.height);
  if (left == null || top == null || width == null || height == null) return null;
  return [left, top, width, height].map((item) => Math.round(item)).join(':');
}

function imageRequestManifestKey(request: Record<string, unknown>): string {
  return [
    request.operation,
    request.operationType,
    request.mode,
    request.providerRequestId,
    request.providerInteractionId,
    request.previousInteractionId,
    request.model,
    request.promptLength,
    request.referenceCount,
  ]
    .map((value) => (value == null ? '' : String(value)))
    .join('|');
}

function isEditRequest(request: Record<string, unknown>): boolean {
  const operation = String(request.operation ?? '').toLowerCase();
  const operationType = String(request.operationType ?? '').toLowerCase();
  const mode = String(request.mode ?? '').toLowerCase();
  return operationType === 'edit' || operation.includes('edit') || mode.includes('edit');
}

function isOriginalPanelCropValidationRequest(request: Record<string, unknown>): boolean {
  const operation = String(request.operation ?? '').toLowerCase();
  const repairMode = String(request.repairMode ?? '').toLowerCase();
  return (
    repairMode === 'original' || operation === 'graphic_novel_panel_crop_validation_original'
  );
}

function isPanelImageRequest(request: Record<string, unknown>): boolean {
  if (isOriginalPanelCropValidationRequest(request)) return false;

  const operation = String(request.operation ?? '').toLowerCase();
  if (operation.startsWith('graphic_novel_template_panel_')) return true;
  if (operation.startsWith('graphic_novel_panel_crop_')) return true;
  if (numericValue(request.panelIndex) != null || numericValue(request.panelNumber) != null) {
    return true;
  }
  const prompt = stringValue(request.prompt) ?? stringValue(request.fullTextPrompt);
  return prompt ? /replacement comic panel crop|artwork inside Panel\s+\d+/i.test(prompt) : false;
}

function requestPanelIndex(
  request: Record<string, unknown>,
  cropPanelIndexByKey: Map<string, number>
): number | null {
  const panelNumber = numericValue(request.panelNumber);
  if (panelNumber != null) return panelNumber;

  const explicitPanelIndex = numericValue(request.panelIndex);
  if (explicitPanelIndex != null) {
    return explicitPanelIndex <= 0 ? explicitPanelIndex + 1 : explicitPanelIndex;
  }

  const cropKey = cropRectKey(request.cropRect);
  if (cropKey && cropPanelIndexByKey.has(cropKey)) {
    return cropPanelIndexByKey.get(cropKey)!;
  }

  const prompt = stringValue(request.prompt) ?? stringValue(request.fullTextPrompt);
  const match = prompt?.match(/artwork inside Panel\s+(\d+)|\bPanel\s+(\d+)\s*:/i);
  return match ? numericValue(match[1] ?? match[2]) : null;
}

function validationPanelIndex(validation: AdminStoryValidationItem): number | null {
  const explicit = numericValue(validation.panelIndex);
  if (explicit != null) return explicit;
  const manifest = recordOrNull(validation.requestManifest);
  const panelNumber = numericValue(manifest?.panelNumber);
  if (panelNumber != null) return panelNumber;
  const panelIndex = numericValue(manifest?.panelIndex);
  return panelIndex == null ? null : panelIndex <= 0 ? panelIndex + 1 : panelIndex;
}

function isPanelValidation(validation: AdminStoryValidationItem): boolean {
  return (
    validation.subjectType === 'graphic_novel_panel' || validationPanelIndex(validation) != null
  );
}

function panelRepairRequestManifest(
  validation: AdminStoryValidationItem
): Record<string, unknown> | null {
  const manifest = recordOrNull(validation.requestManifest);
  const repairManifest = recordOrNull(manifest?.panelRepairRequestManifest);
  if (!repairManifest) return null;
  if (isOriginalPanelCropValidationRequest(repairManifest)) return null;

  return repairManifest;
}

function isPanelRepairGenerateRequest(request: Record<string, unknown>): boolean {
  const operation = String(request.operation ?? '').toLowerCase();
  return operation === 'graphic_novel_panel_crop_validation_regenerate';
}

function editRequestProducesValidationAttempt(
  request: Record<string, unknown>,
  validation: AdminStoryValidationItem
): boolean {
  const repairAttempt = numericValue(request.repairAttempt);
  if (repairAttempt != null) return repairAttempt === validation.attempt;

  const outputAttempt = numericValue(request.outputAttempt);
  if (outputAttempt != null) return outputAttempt === validation.attempt;

  const previousAttempt = numericValue(request.previousAttempt);
  if (previousAttempt != null) return previousAttempt + 1 === validation.attempt;

  return false;
}

function requestPromptChars(request: Record<string, unknown> | null): number | null {
  if (!request) return null;
  return (
    numericValue(request.promptLength) ??
    numericValue(request.runtimePromptChars) ??
    numericValue(request.combinedPromptChars) ??
    numericValue(request.cachedPrefixChars)
  );
}

function requestReferenceCount(request: Record<string, unknown> | null): number | null {
  if (!request) return null;
  const explicitCount = numericValue(request.referenceCount);
  if (explicitCount != null) return explicitCount;
  const selectedCount = numericValue(request.selectedReferenceCount);
  if (selectedCount != null) return selectedCount;
  const references = arrayOfRecords(request.referenceImages);
  return references.length > 0 ? references.length : null;
}

function requestReferences(requests: Record<string, unknown>[]): Record<string, unknown>[] {
  return requests.flatMap((request) => arrayOfRecords(request.referenceImages));
}

function referenceManifestIdentity(
  reference: Record<string, unknown>,
  fallbackIndex: number
): string {
  const bindingId = stringValue(reference.referenceBindingId);
  if (bindingId) return `binding:${bindingId}`;
  return `index:${
    numericValue(reference.imageIndex) ?? numericValue(reference.index) ?? fallbackIndex + 1
  }`;
}

function mergeReferenceManifests(
  scopedReferences: Record<string, unknown>[],
  rootReferences: Record<string, unknown>[]
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  const keyByImageIndex = new Map<number, string>();
  rootReferences.forEach((reference, index) => {
    const key = referenceManifestIdentity(reference, index);
    merged.set(key, reference);
    const imageIndex =
      numericValue(reference.imageIndex) ?? numericValue(reference.index) ?? index + 1;
    keyByImageIndex.set(imageIndex, key);
  });
  scopedReferences.forEach((reference, index) => {
    const imageIndex =
      numericValue(reference.imageIndex) ?? numericValue(reference.index) ?? index + 1;
    const requestedKey = referenceManifestIdentity(reference, index);
    const key = merged.has(requestedKey)
      ? requestedKey
      : (keyByImageIndex.get(imageIndex) ?? requestedKey);
    const existing = merged.get(key) ?? {};
    merged.set(key, {
      ...existing,
      ...Object.fromEntries(
        Object.entries(reference).filter(([, value]) => value !== null && value !== undefined)
      ),
    });
    keyByImageIndex.set(imageIndex, key);
  });
  return Array.from(merged.values());
}

function assetUrlForStoragePath(storagePath: string | null): string | null {
  if (!storagePath) return null;
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) return storagePath;
  if (storagePath.startsWith('/api/')) return storagePath;
  return `/api/v1/assets/${storagePath}`;
}

function requestPanelImageStoragePath(request: Record<string, unknown> | null): string | null {
  if (!request) return null;
  return (
    stringValue(request.panelImageStoragePath) ??
    stringValue(request.outputImageStoragePath) ??
    null
  );
}

function requestPanelImageUrl(request: Record<string, unknown> | null): string | null {
  if (!request) return null;
  return (
    stringValue(request.panelImageUrl) ??
    assetUrlForStoragePath(requestPanelImageStoragePath(request))
  );
}

function buildRawManifest(
  root: Record<string, unknown>,
  requests: Record<string, unknown>[],
  kind: AdminImageGenerationKind,
  extras?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...root,
    ...extras,
    generationKind: kind,
    requests,
    initialRequests: kind === 'generate' ? requests : undefined,
    editRequests: kind === 'edit' ? requests : undefined,
  };
}

function panelImageGenerationForPanel(
  root: Record<string, unknown>,
  panelIndex?: number | null
): Record<string, unknown> | undefined {
  if (panelIndex == null) return undefined;
  const panelGeneration = recordOrNull(root.panelImageGeneration);
  if (!panelGeneration) return undefined;

  const matchingPanels = arrayOfRecords(panelGeneration.panels).filter(
    (panel) => numericValue(panel.panelIndex) === panelIndex
  );
  return {
    ...panelGeneration,
    panelCount: matchingPanels.length,
    panels: matchingPanels,
  };
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null)
  );
}

function restoreFullSystemInstruction(
  config: Record<string, unknown>,
  request: Record<string, unknown>
): Record<string, unknown> {
  const fullSystemInstruction = stringValue(request.systemInstruction);
  if (!fullSystemInstruction) return config;

  if ('system_instruction' in config && !('systemInstruction' in config)) {
    return {
      ...config,
      system_instruction: fullSystemInstruction,
    };
  }

  return {
    ...config,
    systemInstruction: fullSystemInstruction,
  };
}

function buildModelRequestConfig(
  modelRequest: Record<string, unknown>,
  request: Record<string, unknown>
): Record<string, unknown> | null {
  const explicitConfig = recordOrNull(modelRequest.config);
  if (explicitConfig) return restoreFullSystemInstruction(explicitConfig, request);

  const config = compactRecord({
    stream: modelRequest.stream,
    store: modelRequest.store,
    response_format: modelRequest.response_format,
    system_instruction: request.systemInstruction ?? modelRequest.system_instruction,
  });
  return Object.keys(config).length > 0 ? config : null;
}

function buildDisplayedModelRequest(request: Record<string, unknown>): Record<string, unknown> {
  const modelRequest = recordOrNull(request.modelRequest);
  if (!modelRequest) return request;

  return compactRecord({
    operation: request.operation ?? request.operationType,
    endpoint: modelRequest.endpoint ?? request.endpointUsed,
    model: modelRequest.model ?? request.model,
    input: modelRequest.input,
    config: buildModelRequestConfig(modelRequest, request),
  });
}

function buildModelRawManifest(
  requests: Record<string, unknown>[],
  kind: AdminImageGenerationKind
): Record<string, unknown> {
  const modelRequests = requests.map(buildDisplayedModelRequest);

  return compactRecord({
    version: 2,
    generationKind: kind,
    requestCount: modelRequests.length,
    request: modelRequests.length === 1 ? modelRequests[0] : undefined,
    requests: modelRequests.length === 1 ? undefined : modelRequests,
  });
}

function buildAttempt(params: {
  generationIndex: number;
  sceneIndex: number;
  pageNumber?: number | null;
  panelIndex?: number | null;
  panelId?: string | null;
  cropRect?: unknown | null;
  kind: AdminImageGenerationKind;
  label?: string;
  root: Record<string, unknown>;
  requests: Record<string, unknown>[];
  validation: AdminStoryValidationItem | null;
  validationMissingReason?: string | null;
  fallbackImageUrl?: string | null;
  fallbackImageStoragePath?: string | null;
}): AdminImageGenerationAttempt {
  const firstRequest = params.requests[0] ?? null;
  const isPanelAttempt = params.panelIndex != null;
  const panelImageStoragePath = isPanelAttempt ? requestPanelImageStoragePath(firstRequest) : null;
  const panelImageUrl = isPanelAttempt ? requestPanelImageUrl(firstRequest) : null;
  const scopedReferences = requestReferences(params.requests);
  const mergedReferences = mergeReferenceManifests(
    scopedReferences,
    arrayOfRecords(params.root.references)
  );
  const imageStoragePath =
    panelImageStoragePath ??
    params.validation?.imageStoragePath ??
    (isPanelAttempt
      ? null
      : (stringValue(params.root.imageStoragePath) ?? params.fallbackImageStoragePath)) ??
    null;
  return {
    generationIndex: params.generationIndex,
    sceneIndex: params.sceneIndex,
    pageNumber: params.pageNumber,
    panelIndex: params.panelIndex,
    panelId: params.panelId,
    cropRect: params.cropRect,
    kind: params.kind,
    label:
      params.label ??
      (params.kind === 'edit'
        ? `Edit attempt ${params.generationIndex}`
        : `Generation attempt ${params.generationIndex}`),
    imageUrl:
      panelImageUrl ??
      params.validation?.imageUrl ??
      (isPanelAttempt ? null : params.fallbackImageUrl) ??
      null,
    imageStoragePath,
    validation: params.validation,
    validationMissingReason: params.validation ? null : (params.validationMissingReason ?? null),
    requests: params.requests,
    rawManifest: buildRawManifest(params.root, params.requests, params.kind, {
      pageNumber: params.pageNumber,
      panelIndex: params.panelIndex,
      panelId: params.panelId,
      cropRect: params.cropRect,
      panelImageGeneration: panelImageGenerationForPanel(params.root, params.panelIndex),
      references: mergedReferences,
    }),
    modelRawManifest: buildModelRawManifest(params.requests, params.kind),
    validationRawManifest: recordOrNull(params.validation?.requestManifest),
    summary: {
      operation:
        stringValue(firstRequest?.operation) ??
        stringValue(firstRequest?.operationType) ??
        params.kind,
      mode: stringValue(firstRequest?.mode) ?? stringValue(params.root.mode),
      model: stringValue(firstRequest?.model) ?? stringValue(params.root.model),
      promptChars: requestPromptChars(firstRequest),
      referenceCount:
        requestReferenceCount(firstRequest) ?? numericValue(params.root.referenceCount),
      requestCount: params.requests.length,
    },
  };
}

function panelLabel(params: {
  pageNumber?: number | null;
  panelIndex: number;
  kind: AdminImageGenerationKind;
  attempt: number;
  isRepairGenerate?: boolean;
}): string {
  const prefix = params.pageNumber
    ? `Page ${params.pageNumber} · Panel ${params.panelIndex}`
    : `Panel ${params.panelIndex}`;
  if (params.kind === 'edit') return `${prefix} · Edit attempt ${params.attempt}`;
  if (params.isRepairGenerate) return `${prefix} · Regenerate attempt ${params.attempt}`;
  return `${prefix} · Generate attempt ${params.attempt}`;
}

type PanelRequestEntry = {
  request: Record<string, unknown>;
  panelIndex: number;
  key: string;
};

function isPanelRepairRequest(request: Record<string, unknown>): boolean {
  return isEditRequest(request) || isPanelRepairGenerateRequest(request);
}

function panelRequestKind(request: Record<string, unknown>): AdminImageGenerationKind {
  if (isEditRequest(request)) return 'edit';
  return 'generate';
}

function panelAttemptNumber(request: Record<string, unknown> | null, fallback: number): number {
  return (
    numericValue(request?.repairAttempt) ??
    numericValue(request?.outputAttempt) ??
    numericValue(request?.attempt) ??
    fallback
  );
}

function validationPageNumber(validation: AdminStoryValidationItem): number | null {
  return numericValue(validation.pageNumber) ?? numericValue(validation.graphicNovelPageNumber);
}

function buildPanelAttempts(params: {
  sceneIndex: number;
  root: Record<string, unknown>;
  allRequests: Record<string, unknown>[];
  sortedValidations: AdminStoryValidationItem[];
  fallbackImageUrl?: string | null;
  fallbackImageStoragePath?: string | null;
}): AdminImageGenerationAttempt[] | null {
  const panelGeneration = recordOrNull(params.root.panelImageGeneration);
  const panelRows = arrayOfRecords(panelGeneration?.panels);
  const cropPanelIndexByKey = new Map<string, number>();
  const panelRowByIndex = new Map<number, Record<string, unknown>>();

  for (const panelRow of panelRows) {
    const panelIndex = numericValue(panelRow.panelIndex);
    if (panelIndex == null) continue;
    panelRowByIndex.set(panelIndex, panelRow);
    const cropKey = cropRectKey(panelRow.cropRect);
    if (cropKey) cropPanelIndexByKey.set(cropKey, panelIndex);
  }

  const panelRequests: PanelRequestEntry[] = params.allRequests.flatMap((request) => {
    if (!isPanelImageRequest(request)) return [];
    const panelIndex = requestPanelIndex(request, cropPanelIndexByKey);
    if (panelIndex == null) return [];
    return [
      {
        request,
        panelIndex,
        key: imageRequestManifestKey(request),
      },
    ];
  });
  const panelValidations = params.sortedValidations.filter(isPanelValidation);

  if (panelRequests.length === 0 && panelValidations.length === 0) {
    return null;
  }

  const panelIndexes = Array.from(
    new Set([
      ...panelRequests.map((entry) => entry.panelIndex),
      ...panelValidations
        .map((validation) => validationPanelIndex(validation))
        .filter((panelIndex): panelIndex is number => panelIndex != null),
    ])
  ).sort((left, right) => left - right);
  if (panelIndexes.length === 0) {
    return null;
  }
  const attempts: AdminImageGenerationAttempt[] = [];

  for (const panelIndex of panelIndexes) {
    const panelRow = panelRowByIndex.get(panelIndex) ?? null;
    const requestsForPanel = panelRequests.filter((entry) => entry.panelIndex === panelIndex);
    const initialRequests = requestsForPanel.filter(
      (entry) => !isPanelRepairRequest(entry.request)
    );
    const repairRequests = requestsForPanel.filter((entry) => isPanelRepairRequest(entry.request));
    const validationsForPanel = panelValidations.filter(
      (validation) => validationPanelIndex(validation) === panelIndex
    );
    const pageNumber =
      validationsForPanel
        .map(validationPageNumber)
        .find((value): value is number => value != null) ??
      numericValue(params.root.pageNumber) ??
      numericValue(params.root.graphicNovelPageNumber);
    const panelId =
      validationsForPanel
        .map((validation) => stringValue(validation.panelId))
        .find((value): value is string => !!value) ?? stringValue(panelRow?.panelId);
    const cropRect =
      validationsForPanel.map((validation) => validation.cropRect).find((value) => value != null) ??
      panelRow?.cropRect ??
      requestsForPanel.map((entry) => entry.request.cropRect).find((value) => value != null) ??
      null;
    const usedRequestKeys = new Set<string>();
    let emittedInitialRequests = false;

    const emitAttempt = (paramsForAttempt: {
      kind: AdminImageGenerationKind;
      requests: Record<string, unknown>[];
      validation: AdminStoryValidationItem | null;
      validationMissingReason?: string | null;
      label: string;
    }) => {
      paramsForAttempt.requests.forEach((request) =>
        usedRequestKeys.add(imageRequestManifestKey(request))
      );
      attempts.push(
        buildAttempt({
          generationIndex: attempts.length + 1,
          sceneIndex: params.sceneIndex,
          pageNumber,
          panelIndex,
          panelId,
          cropRect,
          kind: paramsForAttempt.kind,
          label: paramsForAttempt.label,
          root: params.root,
          requests: paramsForAttempt.requests,
          validation: paramsForAttempt.validation,
          validationMissingReason: paramsForAttempt.validationMissingReason,
          fallbackImageUrl: params.fallbackImageUrl,
          fallbackImageStoragePath: params.fallbackImageStoragePath,
        })
      );
    };

    const emitInitialRequests = (
      validation: AdminStoryValidationItem | null,
      validationMissingReason?: string | null
    ) => {
      if (emittedInitialRequests) return;
      emittedInitialRequests = true;

      if (initialRequests.length === 0) {
        if (validation) {
          emitAttempt({
            kind: 'generate',
            requests: [],
            validation,
            label: panelLabel({
              pageNumber,
              panelIndex,
              kind: 'generate',
              attempt: validation.attempt,
            }),
          });
        }
        return;
      }

      initialRequests.forEach((entry, index) => {
        const attachValidation = validation && index === initialRequests.length - 1;
        const attemptNumber = attachValidation
          ? validation.attempt
          : panelAttemptNumber(entry.request, index + 1);
        emitAttempt({
          kind: 'generate',
          requests: [entry.request],
          validation: attachValidation ? validation : null,
          validationMissingReason: attachValidation ? null : validationMissingReason,
          label: panelLabel({
            pageNumber,
            panelIndex,
            kind: 'generate',
            attempt: attemptNumber,
          }),
        });
      });
    };

    if (validationsForPanel.length === 0) {
      emitInitialRequests(null);
    }

    for (const validation of validationsForPanel) {
      const repairManifest = panelRepairRequestManifest(validation);
      if (!repairManifest) {
        if (!emittedInitialRequests) {
          emitInitialRequests(validation);
        } else {
          emitAttempt({
            kind: 'unknown',
            requests: [],
            validation,
            label: panelLabel({
              pageNumber,
              panelIndex,
              kind: 'generate',
              attempt: validation.attempt,
            }),
          });
        }
        continue;
      }

      emitInitialRequests(null, 'not persisted · repaired');
      const repairKind = panelRequestKind(repairManifest);
      emitAttempt({
        kind: repairKind,
        requests: [repairManifest],
        validation,
        label: panelLabel({
          pageNumber,
          panelIndex,
          kind: repairKind,
          attempt: validation.attempt,
          isRepairGenerate: repairKind === 'generate',
        }),
      });
    }

    for (const entry of repairRequests) {
      if (usedRequestKeys.has(entry.key)) continue;
      const kind = panelRequestKind(entry.request);
      emitAttempt({
        kind,
        requests: [entry.request],
        validation: null,
        label: panelLabel({
          pageNumber,
          panelIndex,
          kind,
          attempt: panelAttemptNumber(entry.request, attempts.length + 1),
          isRepairGenerate: kind === 'generate',
        }),
      });
    }
  }

  return attempts;
}

export function buildAdminImageGenerationAttempts(params: {
  sceneIndex: number;
  manifest: unknown;
  validations: AdminStoryValidationItem[];
  fallbackImageUrl?: string | null;
  fallbackImageStoragePath?: string | null;
}): AdminImageGenerationAttempt[] {
  const root = recordOrNull(params.manifest) ?? {};
  const allRequests = arrayOfRecords(root.requests);
  const initialRequestsRaw = arrayOfRecords(root.initialRequests);
  const editRequests = arrayOfRecords(root.editRequests);
  const editRequestKeys = new Set(editRequests.map(imageRequestManifestKey));
  const initialRequests =
    initialRequestsRaw.length > 0
      ? initialRequestsRaw
      : editRequests.length > 0
        ? allRequests.filter((request) => !editRequestKeys.has(imageRequestManifestKey(request)))
        : allRequests.filter((request) => !isEditRequest(request));
  const fallbackInitialRequests = initialRequests.length > 0 ? initialRequests : allRequests;
  const sortedValidations = [...params.validations].sort((left, right) => {
    if (left.attempt !== right.attempt) return left.attempt - right.attempt;
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
  const panelAttempts = buildPanelAttempts({
    sceneIndex: params.sceneIndex,
    root,
    allRequests,
    sortedValidations,
    fallbackImageUrl: params.fallbackImageUrl,
    fallbackImageStoragePath: params.fallbackImageStoragePath,
  });
  if (panelAttempts) return panelAttempts;

  const attempts: AdminImageGenerationAttempt[] = [];
  const usedEditRequestKeys = new Set<string>();

  if (sortedValidations.length > 0) {
    sortedValidations.forEach((validation, validationIndex) => {
      let kind: AdminImageGenerationKind = validationIndex === 0 ? 'generate' : 'edit';
      let requests =
        validationIndex === 0
          ? fallbackInitialRequests
          : editRequests.filter((request) =>
              editRequestProducesValidationAttempt(request, validation)
            );

      if (validationIndex > 0 && requests.length === 0) {
        const unusedEditRequests = editRequests.filter(
          (request) => !usedEditRequestKeys.has(imageRequestManifestKey(request))
        );
        requests = unusedEditRequests.length > 0 ? [unusedEditRequests[0]] : [];
      }

      if (validationIndex > 0 && requests.length === 0) {
        kind = 'unknown';
      }

      requests.forEach((request) => usedEditRequestKeys.add(imageRequestManifestKey(request)));
      attempts.push(
        buildAttempt({
          generationIndex: attempts.length + 1,
          sceneIndex: params.sceneIndex,
          kind,
          root,
          requests,
          validation,
          fallbackImageUrl: params.fallbackImageUrl,
          fallbackImageStoragePath: params.fallbackImageStoragePath,
        })
      );
    });
  } else if (fallbackInitialRequests.length > 0 || params.fallbackImageUrl) {
    attempts.push(
      buildAttempt({
        generationIndex: 1,
        sceneIndex: params.sceneIndex,
        kind: fallbackInitialRequests.some(isEditRequest) ? 'unknown' : 'generate',
        root,
        requests: fallbackInitialRequests,
        validation: null,
        fallbackImageUrl: params.fallbackImageUrl,
        fallbackImageStoragePath: params.fallbackImageStoragePath,
      })
    );
  }

  const remainingEditRequests = editRequests.filter(
    (request) => !usedEditRequestKeys.has(imageRequestManifestKey(request))
  );
  for (const request of remainingEditRequests) {
    attempts.push(
      buildAttempt({
        generationIndex: attempts.length + 1,
        sceneIndex: params.sceneIndex,
        kind: 'edit',
        root,
        requests: [request],
        validation: null,
        fallbackImageUrl: params.fallbackImageUrl,
        fallbackImageStoragePath: params.fallbackImageStoragePath,
      })
    );
  }

  return attempts;
}
