export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type HttpAccessClass =
  | 'public'
  | 'optional'
  | 'auth'
  | 'parent'
  | 'child'
  | 'admin'
  | 'asset'
  | 'webhook'
  | 'ssr';

export interface HttpEndpointManifestEntry {
  method: HttpMethod;
  path: string;
  accessClass: HttpAccessClass;
  expectedStatuses: readonly number[];
  testOwner: string;
}

type RouteTuple = readonly [HttpMethod, string];

function ownedRoutes(
  accessClass: HttpAccessClass,
  expectedStatuses: readonly number[],
  testOwner: string,
  routes: readonly RouteTuple[]
): HttpEndpointManifestEntry[] {
  return routes.map(([method, path]) => ({
    method,
    path,
    accessClass,
    expectedStatuses,
    testOwner,
  }));
}

const routeTests = 'services/api/src/routes/__tests__';

/**
 * Explicit ownership contract for every registered Express route.
 *
 * Keep routes grouped by the contract that owns their functional HTTP behavior.
 * Access classes are intentionally data, not inferred from URL naming.
 */
export const HTTP_ENDPOINT_MANIFEST: readonly HttpEndpointManifestEntry[] = [
  ...ownedRoutes('webhook', [200, 400], `${routeTests}/billingWebhookHttpContract.test.ts`, [
    ['POST', '/api/v1/billing/webhook/stripe'],
    ['POST', '/api/v1/billing/webhook/revenuecat'],
  ]),

  ...ownedRoutes('public', [200], `${routeTests}/healthOpsHttpContract.test.ts`, [
    ['GET', '/health'],
    ['GET', '/api/v1/ops/status'],
  ]),
  ...ownedRoutes('admin', [200, 403], `${routeTests}/healthOpsHttpContract.test.ts`, [
    ['GET', '/health/detailed'],
    ['GET', '/health/queues'],
    ['GET', '/health/image-rate-limiter'],
  ]),

  ...ownedRoutes('ssr', [200, 304, 404], `${routeTests}/ssrRoutesHttpContract.test.ts`, [
    ['GET', '/sitemap.xml'],
    ['GET', '/ssr/stories'],
    ['GET', '/ssr/stories/catalog/:locale'],
    ['GET', '/ssr/stories/:slug'],
    ['GET', '/ssr/u/:token'],
    ['GET', '/ssr/authors/:authorId'],
    ['GET', '/ssr/landing'],
    ['GET', '/ssr/landing/:locale'],
    ['GET', '/ssr/pricing'],
    ['GET', '/ssr/pricing/:locale'],
    ['GET', '/ssr/legal/terms'],
    ['GET', '/ssr/legal/terms/:locale'],
    ['GET', '/ssr/legal/privacy'],
    ['GET', '/ssr/legal/privacy/:locale'],
    ['GET', '/ssr/support'],
    ['GET', '/ssr/support/:locale'],
    ['GET', '/ssr/blog'],
    ['GET', '/ssr/blog/index/:locale'],
    ['GET', '/ssr/blog/:slug'],
    ['GET', '/ssr/blog/:locale/:slug'],
    ['GET', '/ssr/updates'],
    ['GET', '/ssr/updates/:locale'],
    ['GET', '/share-card/u/:token'],
    ['GET', '/share-card/:slug'],
  ]),

  ...ownedRoutes('public', [200, 302, 404], `${routeTests}/oauthEntrypointsHttpContract.test.ts`, [
    ['GET', '/api/v1/auth/google/start'],
    ['POST', '/api/v1/auth/google/token'],
    ['GET', '/api/v1/auth/apple/start'],
    ['POST', '/api/v1/auth/apple/token'],
  ]),
  ...ownedRoutes('public', [302, 400, 404], `${routeTests}/authSessionLifecycleHttpContract.test.ts`, [
    ['GET', '/api/v1/auth/google/callback'],
    ['POST', '/api/v1/auth/apple/callback'],
  ]),
  ...ownedRoutes('public', [200, 400, 409], `${routeTests}/authPrivacyEntitlementsHttpContract.test.ts`, [
    ['POST', '/api/v1/auth/sessions'],
    ['POST', '/api/v1/auth/register'],
  ]),
  ...ownedRoutes('public', [200, 400, 429], `${routeTests}/profilePasswordResetHttpContract.test.ts`, [
    ['POST', '/api/v1/auth/forgot-password'],
    ['POST', '/api/v1/auth/reset-password'],
  ]),
  ...ownedRoutes('child', [200, 400, 401], `${routeTests}/parentGateRecoveryHttpContract.test.ts`, [
    ['POST', '/api/v1/auth/child-mode/recovery'],
    ['POST', '/api/v1/auth/parent-gate/google/start'],
    ['POST', '/api/v1/auth/parent-gate'],
  ]),
  ...ownedRoutes('public', [200, 400], `${routeTests}/parentGateRecoveryHttpContract.test.ts`, [
    ['POST', '/api/v1/auth/child-mode/recovery/complete'],
  ]),
  ...ownedRoutes('child', [200, 400, 410], `${routeTests}/authSessionLifecycleHttpContract.test.ts`, [
    ['POST', '/api/v1/auth/parent-gate/apple/start'],
    ['POST', '/api/v1/auth/parent-gate/google-token'],
    ['POST', '/api/v1/auth/parent-gate/apple-token'],
  ]),
  ...ownedRoutes('parent', [200, 400], `${routeTests}/authSessionLifecycleHttpContract.test.ts`, [
    ['DELETE', '/api/v1/auth/sessions'],
  ]),
  ...ownedRoutes('auth', [200, 400, 401], `${routeTests}/authSessionLifecycleHttpContract.test.ts`, [
    ['DELETE', '/api/v1/auth/sessions/current'],
    ['PUT', '/api/v1/auth/sessions/current'],
    ['POST', '/api/v1/auth/refresh'],
  ]),
  ...ownedRoutes('auth', [200, 401], `${routeTests}/compactAuthPlansVoicesHttpContract.test.ts`, [
    ['POST', '/api/v1/auth/logout'],
  ]),

  ...ownedRoutes('parent', [200, 400, 401], `${routeTests}/profilePasswordResetHttpContract.test.ts`, [
    ['GET', '/api/v1/me'],
    ['PATCH', '/api/v1/me'],
    ['PATCH', '/api/v1/me/child-mode-exit-passcode'],
  ]),
  ...ownedRoutes('parent', [200, 401], `${routeTests}/sessionsOauthProfileDeleteHttpContract.test.ts`, [
    ['DELETE', '/api/v1/me'],
    ['GET', '/api/v1/me/sessions'],
    ['DELETE', '/api/v1/me/sessions/:sessionToken'],
    ['GET', '/api/v1/me/oauth-providers'],
    ['POST', '/api/v1/me/oauth-providers'],
    ['DELETE', '/api/v1/me/oauth-providers/:provider'],
  ]),
  ...ownedRoutes('parent', [200, 201, 400, 401], `${routeTests}/authPrivacyEntitlementsHttpContract.test.ts`, [
    ['GET', '/api/v1/me/privacy-requests'],
    ['POST', '/api/v1/me/privacy-requests'],
  ]),
  ...ownedRoutes('auth', [200, 403, 401], `${routeTests}/billingBundlesUsageHttpContract.test.ts`, [
    ['GET', '/api/v1/me/subscription-usage'],
  ]),
  ...ownedRoutes('auth', [200, 403, 401], `${routeTests}/childModeParentalPermissionsContract.test.ts`, [
    ['GET', '/api/v1/me/series'],
    ['GET', '/api/v1/me/stories'],
  ]),

  ...ownedRoutes('auth', [200, 401], `${routeTests}/publicAlignmentLanguagesHttpContract.test.ts`, [
    ['GET', '/api/v1/me/stories/languages'],
  ]),
  ...ownedRoutes('auth', [200, 404, 401], `${routeTests}/quizReadHttpContract.test.ts`, [
    ['GET', '/api/v1/me/stories/quiz-candidate'],
    ['GET', '/api/v1/me/stories/:id/quiz'],
  ]),
  ...ownedRoutes('auth', [200, 400, 404, 409, 401], `${routeTests}/quizGenerateHttpContract.test.ts`, [
    ['POST', '/api/v1/me/stories/:id/quiz'],
  ]),
  ...ownedRoutes('auth', [200, 400, 404, 401], `${routeTests}/quizReadHttpContract.test.ts`, [
    ['PUT', '/api/v1/me/stories/:id/quiz/answers/:activityId'],
  ]),
  ...ownedRoutes('auth', [200, 404, 401], `${routeTests}/clientApiAuthorizationContract.test.ts`, [
    ['GET', '/api/v1/me/stories/:id/alignment'],
  ]),
  ...ownedRoutes('auth', [200, 404, 401], `${routeTests}/storyLibraryMutateHttpContract.test.ts`, [
    ['GET', '/api/v1/me/stories/:id'],
  ]),

  ...ownedRoutes('auth', [200, 201, 400, 404, 409, 401], `${routeTests}/mapTileAndArtifactHttpContract.test.ts`, [
    ['GET', '/api/v1/me/artifacts'],
    ['POST', '/api/v1/me/artifacts/collect'],
    ['GET', '/api/v1/me/map-tiles'],
    ['GET', '/api/v1/me/map-tiles/story/:storyId'],
    ['POST', '/api/v1/me/map-tiles/collect'],
    ['PUT', '/api/v1/me/map-tiles/layout'],
  ]),

  ...ownedRoutes('public', [200], `${routeTests}/publicClientApiContract.test.ts`, [
    ['GET', '/api/v1/plans'],
    ['GET', '/api/v1/dictionaries/character-traits'],
    ['GET', '/api/v1/dictionaries/story-themes'],
    ['GET', '/api/v1'],
  ]),
  ...ownedRoutes('parent', [200, 400, 501, 401], `${routeTests}/compactAuthPlansVoicesHttpContract.test.ts`, [
    ['GET', '/api/v1/plans/with-features'],
    ['PUT', '/api/v1/plans/billing-currency'],
    ['PUT', '/api/v1/plans/upgrade'],
  ]),
  ...ownedRoutes('parent', [200, 404, 401], `${routeTests}/authPrivacyEntitlementsHttpContract.test.ts`, [
    ['GET', '/api/v1/entitlements'],
  ]),

  ...ownedRoutes('parent', [200, 201, 204, 400, 403, 404, 401], `${routeTests}/childrenCrudHttpContract.test.ts`, [
    ['GET', '/api/v1/children'],
    ['POST', '/api/v1/children'],
    ['PATCH', '/api/v1/children/:id'],
    ['DELETE', '/api/v1/children/:id'],
  ]),
  ...ownedRoutes('parent', [200, 400, 403, 401], `${routeTests}/instantAnalyzeChainHttpContract.test.ts`, [
    ['POST', '/api/v1/children/analyze'],
  ]),
  ...ownedRoutes('auth', [200, 201, 403, 404, 401], `${routeTests}/childModeParentalPermissionsContract.test.ts`, [
    ['GET', '/api/v1/children/child-mode/switcher'],
  ]),
  ...ownedRoutes('parent', [200, 201, 403, 404, 401], `${routeTests}/childModeParentalPermissionsContract.test.ts`, [
    ['GET', '/api/v1/children/:id/child-mode'],
    ['PATCH', '/api/v1/children/:id/child-mode'],
    ['POST', '/api/v1/children/:id/child-mode/sessions'],
    ['DELETE', '/api/v1/children/:id/child-mode/sessions'],
  ]),
  ...ownedRoutes('child', [200, 403, 401], `${routeTests}/childModeParentalPermissionsContract.test.ts`, [
    ['GET', '/api/v1/children/child-mode/current'],
  ]),

  ...ownedRoutes('auth', [200, 201, 204, 400, 403, 404, 429, 401], `${routeTests}/charactersCrudHttpContract.test.ts`, [
    ['GET', '/api/v1/characters'],
    ['POST', '/api/v1/characters'],
    ['GET', '/api/v1/characters/:id'],
  ]),
  ...ownedRoutes('parent', [200, 204, 400, 403, 404, 401], `${routeTests}/charactersCrudHttpContract.test.ts`, [
    ['DELETE', '/api/v1/characters/:id'],
    ['PATCH', '/api/v1/characters/:id'],
  ]),
  ...ownedRoutes('auth', [200, 400, 403, 401], `${routeTests}/instantAnalyzeChainHttpContract.test.ts`, [
    ['POST', '/api/v1/characters/analyze'],
  ]),

  ...ownedRoutes('parent', [201, 400, 403, 429, 401], `${routeTests}/coreGenerationHttpContract.test.ts`, [
    ['POST', '/api/v1/stories'],
  ]),
  ...ownedRoutes('child', [201, 400, 403, 401], `${routeTests}/childModeGenerationHttpContract.test.ts`, [
    ['POST', '/api/v1/stories/child-mode'],
  ]),
  ...ownedRoutes('auth', [201, 400, 403, 429, 401], `${routeTests}/childModeGenerationHttpContract.test.ts`, [
    ['POST', '/api/v1/stories/instant'],
  ]),
  ...ownedRoutes('auth', [200, 404, 401], `${routeTests}/storyReadRegenerationHttpContract.test.ts`, [
    ['GET', '/api/v1/stories/requests/:id/status'],
    ['GET', '/api/v1/stories/:id'],
    ['GET', '/api/v1/stories'],
    ['GET', '/api/v1/stories/:id/series'],
    ['GET', '/api/v1/stories/:id/status'],
    ['GET', '/api/v1/stories/:id/cost'],
  ]),
  ...ownedRoutes('public', [200, 404], `${routeTests}/storyReadRegenerationHttpContract.test.ts`, [
    ['GET', '/api/v1/stories/published'],
  ]),
  ...ownedRoutes('optional', [200, 403, 404], `${routeTests}/storyReadRegenerationHttpContract.test.ts`, [
    ['GET', '/api/v1/stories/published/:slug'],
  ]),
  ...ownedRoutes('parent', [200, 400, 404, 409, 429, 401], `${routeTests}/storyContinuationHttpContract.test.ts`, [
    ['POST', '/api/v1/stories/requests/:id/retry-images'],
    ['POST', '/api/v1/stories/:id/schedule-continuation'],
    ['DELETE', '/api/v1/stories/:id/schedule-continuation'],
  ]),
  ...ownedRoutes('parent', [200, 400, 403, 404, 409, 401], `${routeTests}/storyLibraryMutateHttpContract.test.ts`, [
    ['PATCH', '/api/v1/stories/:id/parent-review'],
    ['DELETE', '/api/v1/stories/:id'],
  ]),
  ...ownedRoutes('auth', [200, 400, 403, 404, 409, 401], `${routeTests}/storyLibraryMutateHttpContract.test.ts`, [
    ['PATCH', '/api/v1/stories/:id'],
  ]),
  ...ownedRoutes('auth', [200, 202, 403, 404, 429, 401], `${routeTests}/storyContinuationHttpContract.test.ts`, [
    ['POST', '/api/v1/stories/:id/continue'],
    ['GET', '/api/v1/stories/:id/schedule'],
    ['GET', '/api/v1/stories/:id/generation-status'],
  ]),
  ...ownedRoutes('auth', [200, 202, 400, 403, 404, 429, 401], `${routeTests}/storyAudioAlignmentHttpContract.test.ts`, [
    ['POST', '/api/v1/stories/:id/audio'],
    ['GET', '/api/v1/stories/:id/audio-status'],
    ['GET', '/api/v1/stories/:id/audio'],
  ]),
  ...ownedRoutes('parent', [200, 201, 400, 404, 401], `${routeTests}/storyAudioAlignmentHttpContract.test.ts`, [
    ['POST', '/api/v1/stories/:id/alignment'],
  ]),
  ...ownedRoutes('auth', [200, 404, 401], `${routeTests}/storyLibraryMutateHttpContract.test.ts`, [
    ['GET', '/api/v1/stories/:id/manifest'],
  ]),
  ...ownedRoutes('auth', [200, 400, 404, 422, 401], `${routeTests}/mapTileAndArtifactHttpContract.test.ts`, [
    ['POST', '/api/v1/stories/:id/map-tile'],
  ]),
  ...ownedRoutes('parent', [200, 202, 400, 404, 409, 429, 401], `${routeTests}/storyReadRegenerationHttpContract.test.ts`, [
    ['POST', '/api/v1/stories/:id/scenes/:sceneId/regenerate'],
  ]),
  ...ownedRoutes('auth', [200, 202, 400, 404, 409, 429, 401], `${routeTests}/storyReadRegenerationHttpContract.test.ts`, [
    ['POST', '/api/v1/stories/:id/tts'],
  ]),

  ...ownedRoutes('parent', [201, 400, 403, 429, 401], `${routeTests}/coreGenerationHttpContract.test.ts`, [
    ['POST', '/api/v1/graphic-novels'],
  ]),
  ...ownedRoutes('auth', [200, 404, 401], `${routeTests}/graphicNovelReadHttpContract.test.ts`, [
    ['GET', '/api/v1/graphic-novels/:id'],
    ['GET', '/api/v1/graphic-novels/:id/generation-status'],
  ]),
  ...ownedRoutes('parent', [201, 400, 403, 429, 401], `${routeTests}/coreGenerationHttpContract.test.ts`, [
    ['POST', '/api/v1/mixed-stories'],
  ]),

  ...ownedRoutes('admin', [200, 403], `${routeTests}/imageValidationsHttpContract.test.ts`, [
    ['GET', '/api/v1/image-validations'],
  ]),

  ...ownedRoutes('admin', [200, 201, 204, 400, 404, 403], `${routeTests}/adminFunctionalHttpContract.test.ts`, [
    ['GET', '/api/v1/admin/dashboard'],
    ['GET', '/api/v1/admin/ops/runtime'],
    ['PATCH', '/api/v1/admin/ops/runtime'],
    ['GET', '/api/v1/admin/jobs/:jobId'],
    ['GET', '/api/v1/admin/stories'],
    ['PATCH', '/api/v1/admin/stories/:storyId'],
    ['GET', '/api/v1/admin/users'],
    ['GET', '/api/v1/admin/discount-codes/options'],
    ['GET', '/api/v1/admin/discount-codes'],
    ['POST', '/api/v1/admin/discount-codes'],
    ['PATCH', '/api/v1/admin/discount-codes/:discountCodeId'],
    ['GET', '/api/v1/admin/outfits'],
    ['POST', '/api/v1/admin/outfits/search'],
    ['GET', '/api/v1/admin/voices'],
    ['PATCH', '/api/v1/admin/voices/:voiceId'],
    ['GET', '/api/v1/admin/feedback'],
    ['GET', '/api/v1/admin/moderation-decisions'],
    ['GET', '/api/v1/admin/privacy-requests'],
    ['GET', '/api/v1/admin/privacy-requests/:requestId/export'],
    ['PATCH', '/api/v1/admin/privacy-requests/:requestId'],
    ['PATCH', '/api/v1/admin/users/:userId'],
    ['GET', '/api/v1/admin/image-validations'],
    ['GET', '/api/v1/admin/image-validations/:id/image'],
    ['GET', '/api/v1/admin/image-validations/:id'],
    ['POST', '/api/v1/admin/image-validations/:id/apply-best-scene-image'],
    ['POST', '/api/v1/admin/stories/:storyId/audio/reset'],
    ['GET', '/api/v1/admin/assets/:assetId/image'],
    ['GET', '/api/v1/admin/map-tile-masks/:maskId/image'],
    ['GET', '/api/v1/admin/stories/:storyId/director-scenes'],
    ['POST', '/api/v1/admin/stories/:storyId/scenes/:sceneId/regenerate-image'],
    ['POST', '/api/v1/admin/stories/:storyId/graphic-novel-pages/:pageNumber/regenerate-image'],
    ['GET', '/api/v1/admin/content-config/:resource'],
    ['POST', '/api/v1/admin/content-config/:resource'],
    ['PATCH', '/api/v1/admin/content-config/:resource/:id'],
    ['DELETE', '/api/v1/admin/content-config/:resource/:id'],
    ['GET', '/api/v1/admin/app-releases'],
    ['GET', '/api/v1/admin/app-releases/:releaseId'],
    ['POST', '/api/v1/admin/app-releases'],
    ['PUT', '/api/v1/admin/app-releases/:releaseId'],
    ['GET', '/api/v1/admin/app-releases/:releaseId/email-preview/:locale'],
    ['POST', '/api/v1/admin/app-releases/:releaseId/media'],
    ['DELETE', '/api/v1/admin/app-releases/:releaseId/media/:mediaId'],
  ]),

  ...ownedRoutes('public', [200, 403, 404], `${routeTests}/publicStoriesHttpContract.test.ts`, [
    ['GET', '/api/v1/public/stories'],
    ['GET', '/api/v1/public/stories/:slug'],
    ['GET', '/api/v1/public/authors/:authorId'],
    ['GET', '/api/v1/public/u/:token'],
  ]),
  ...ownedRoutes('optional', [200, 400, 404, 409, 429], `${routeTests}/publicStoriesHttpContract.test.ts`, [
    ['POST', '/api/v1/public/stories/:slug/rating'],
  ]),
  ...ownedRoutes('public', [200, 400, 404, 409], `${routeTests}/publicStoriesHttpContract.test.ts`, [
    ['POST', '/api/v1/public/u/:token/rating'],
  ]),
  ...ownedRoutes('public', [200, 404], `${routeTests}/publicAlignmentLanguagesHttpContract.test.ts`, [
    ['GET', '/api/v1/public/stories/:slug/alignment'],
  ]),

  ...ownedRoutes('asset', [200, 401, 403, 404], `${routeTests}/assetDeliveryHttpContract.test.ts`, [
    ['GET', '/api/v1/assets/llm_turnaround_cache/:filename'],
    ['GET', '/api/v1/assets/:env/:userId/photos/:photoType/:filename'],
    ['GET', '/api/v1/assets/voice-samples/:language/:filename'],
    ['GET', '/api/v1/assets/*'],
  ]),

  ...ownedRoutes('auth', [200, 401], `${routeTests}/compactAuthPlansVoicesHttpContract.test.ts`, [
    ['GET', '/api/v1/voices'],
  ]),
  ...ownedRoutes('auth', [200, 400, 403, 401], `${routeTests}/uploadPhotoHttpContract.test.ts`, [
    ['POST', '/api/v1/upload/photo'],
    ['DELETE', '/api/v1/upload/photo'],
  ]),
  ...ownedRoutes('optional', [201, 400, 403, 429], `${routeTests}/feedbackHttpContract.test.ts`, [
    ['POST', '/api/v1/feedback'],
  ]),
  ...ownedRoutes('parent', [200, 400, 501, 401], `${routeTests}/billingBundlesUsageHttpContract.test.ts`, [
    ['POST', '/api/v1/billing/discount-preview'],
    ['POST', '/api/v1/billing/checkout-session'],
    ['POST', '/api/v1/billing/bundle-checkout'],
    ['POST', '/api/v1/billing/portal-session'],
  ]),
  ...ownedRoutes('parent', [200, 401], `${routeTests}/billingBundlesUsageHttpContract.test.ts`, [
    ['GET', '/api/v1/bundles'],
  ]),
];

export function httpEndpointKey(
  endpoint: Pick<HttpEndpointManifestEntry, 'method' | 'path'>
): string {
  return `${endpoint.method} ${endpoint.path}`;
}

export const HTTP_ENDPOINT_MANIFEST_BY_KEY = new Map(
  HTTP_ENDPOINT_MANIFEST.map((endpoint) => [httpEndpointKey(endpoint), endpoint])
);
