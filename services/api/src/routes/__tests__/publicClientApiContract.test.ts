import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Test HTTP server did not expose a TCP port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

async function main(): Promise<void> {
  process.env.RUN_HTTP_SERVER = 'false';
  process.env.RUN_JOB_WORKERS = 'false';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';

  const { default: app } = await import('../../index');
  const {
    clearRepositoryTestOverrides,
    installRepositoryTestOverrides,
  } = await import('../../repositories');

  const now = new Date('2026-01-01T00:00:00.000Z');
  const planId = '11111111-1111-4111-8111-111111111111';
  const plan = {
    id: planId,
    slug: 'free',
    name: 'Free',
    description: 'A starter plan',
    priceMonthly: 0,
    pricingCurrency: 'EUR',
    billingPeriod: 'monthly',
    isActive: true,
    sortOrder: 0,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  } as any;
  const storyGoal = {
    slug: 'friendship',
    name: 'Friendship',
    description: 'Learn to support friends.',
    minAge: 3,
  } as any;
  const scenario = {
    id: 'forest-path',
    nameKey: 'Forest Path',
    descriptionKey: 'A quiet path through the forest.',
    icon: 'forest',
    suggestedGoals: '["friendship"]',
    ageGroups: '["3-5"]',
  } as any;
  const ageGroup = {
    id: '22222222-2222-4222-8222-222222222222',
    slug: '3-5',
    nameKey: 'age_3_5',
    minMonths: 36,
    maxMonths: 71,
    sortOrder: 1,
  } as any;

  installRepositoryTestOverrides({
    plan: {
      findActivePlans: async () => [plan],
      findFeaturesForPlans: async () => [{
        planId,
        featureId: '33333333-3333-4333-8333-333333333333',
        slug: 'stories_per_month',
        name: 'Stories per month',
        value: { limit: 3 },
        category: 'generation',
      }],
      findPlanPricesForPlanIds: async () => [{
        id: '44444444-4444-4444-8444-444444444444',
        planId,
        pricingCurrency: 'USD',
        priceMonthly: 499,
        stripePriceId: 'price_mock_usd',
        createdAt: now,
        updatedAt: now,
      }],
    } as any,
    dictionary: {
      findTranslations: async () => [],
      findAllGoals: async () => [storyGoal],
      findActiveScenarioCards: async () => [scenario],
      findActiveAgeGroups: async () => [ageGroup],
    } as any,
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  try {
    const apiRoot = await fetch(`${origin}/api/v1`);
    assert.equal(apiRoot.status, 200, 'GET /api/v1 returns 200');
    const apiRootBody = await readJson(apiRoot);
    assert.equal(apiRootBody.name, 'WonderTales API');
    assert.equal(apiRootBody.version, 'v1');

    for (const type of ['child', 'person', 'animal', 'imaginary']) {
      const response = await fetch(
        `${origin}/api/v1/dictionaries/character-traits?type=${type}`
      );
      assert.equal(
        response.status,
        200,
        `GET /api/v1/dictionaries/character-traits?type=${type} returns 200`
      );
      const body = await readJson(response);
      assert.equal(body.status, 'success');
      assert.equal(body.type, type);
      assert.equal(typeof body.dictionaries, 'object');
    }

    const traitsInvalid = await fetch(
      `${origin}/api/v1/dictionaries/character-traits?type=invalid`
    );
    assert.equal(
      traitsInvalid.status,
      400,
      'GET /api/v1/dictionaries/character-traits?type=invalid returns 400'
    );

    const storyThemes = await fetch(
      `${origin}/api/v1/dictionaries/story-themes?locale=en`
    );
    assert.equal(
      storyThemes.status,
      200,
      'GET /api/v1/dictionaries/story-themes returns 200'
    );
    const storyThemesBody = await readJson(storyThemes);
    assert.equal(storyThemesBody.status, 'success');
    assert.equal(storyThemesBody.data.goals[0].slug, storyGoal.slug);
    assert.equal(storyThemesBody.data.scenarioCards[0].id, scenario.id);
    assert.equal(storyThemesBody.data.ageGroups[0].slug, ageGroup.slug);

    const plans = await fetch(
      `${origin}/api/v1/plans?locale=en&currency=USD`
    );
    assert.equal(plans.status, 200, 'GET /api/v1/plans returns 200');
    const plansBody = await readJson(plans);
    assert.equal(plansBody.status, 'success');
    assert.equal(plansBody.billingCurrency, 'USD');
    assert.equal(plansBody.plans[0].slug, plan.slug);
    assert.equal(plansBody.plans[0].priceMonthly, 499);
    assert.equal(plansBody.plans[0].pricingCurrency, 'USD');
    assert.deepEqual(
      plansBody.plans[0].features.stories_per_month.value,
      { limit: 3 }
    );
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('public client API contract passed (7 public 200 + 1 invalid 400 cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
