import type { MainDrawerParamList } from '@/types/navigation';

type WizardRouteParams = NonNullable<MainDrawerParamList['Wizard']>;

const SCENARIO_QUERY_KEYS = ['scenarioCardId', 'scenario', 'theme'] as const;
const SCENARIO_ALIASES: Record<string, string> = {
  scary: 'scary_stories',
  spooky: 'scary_stories',
  scary_stories: 'scary_stories',
};

function normalizeScenarioValue(value?: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return SCENARIO_ALIASES[trimmed] ?? trimmed;
}

export function getWizardScenarioPreset(
  params: WizardRouteParams | undefined,
  search?: string
): string | null {
  for (const key of SCENARIO_QUERY_KEYS) {
    const normalized = normalizeScenarioValue(params?.[key]);
    if (normalized) return normalized;
  }

  if (!search) return null;

  const query = new URLSearchParams(search);
  for (const key of SCENARIO_QUERY_KEYS) {
    const normalized = normalizeScenarioValue(query.get(key));
    if (normalized) return normalized;
  }

  return null;
}
