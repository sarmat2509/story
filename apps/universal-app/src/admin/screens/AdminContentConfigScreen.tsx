import React, { useEffect, useMemo, useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  useCreateAdminContentConfig,
  useAdminContentConfig,
  useDeleteAdminContentConfig,
  useUpdateAdminContentConfig,
  type AdminContentConfigResource,
} from '@/admin/api/admin';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { AdminTable } from '@/admin/components/AdminTable';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

type FieldType = 'text' | 'multiline' | 'number' | 'boolean' | 'select' | 'multiselect';

type SelectOption = {
  label: string;
  value: string;
};

type ResourceConfig = {
  label: string;
  description: string;
  idKey: string;
  columns: string[];
  createOnlyFields?: Array<{
    key: string;
    label: string;
    type: FieldType;
    options?: SelectOption[];
    optionsSource?:
      | 'ageEngineRules'
      | 'scenarioCards'
      | 'storyGoals'
      | 'plans'
      | 'features'
      | 'featureCategories';
  }>;
  editableFields: Array<{
    key: string;
    label: string;
    type: FieldType;
    options?: SelectOption[];
    optionsSource?:
      | 'ageEngineRules'
      | 'scenarioCards'
      | 'storyGoals'
      | 'plans'
      | 'features'
      | 'featureCategories';
  }>;
};

type DraftValue = string | boolean | string[];

const FEATURE_TYPE_OPTIONS: SelectOption[] = [
  { label: 'Boolean', value: 'boolean' },
  { label: 'Numeric', value: 'numeric' },
  { label: 'Enum', value: 'enum' },
];

const RESOURCE_CONFIGS: Record<AdminContentConfigResource, ResourceConfig> = {
  plans: {
    label: 'Plans',
    description: 'Subscription plans and pricing catalog.',
    idKey: 'id',
    columns: ['slug', 'name', 'priceMonthly', 'pricingCurrency', 'billingPeriod', 'isActive'],
    editableFields: [
      { key: 'slug', label: 'Slug', type: 'text' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'multiline' },
      { key: 'priceMonthly', label: 'Price monthly', type: 'number' },
      { key: 'pricingCurrency', label: 'Pricing currency', type: 'text' },
      { key: 'billingPeriod', label: 'Billing period', type: 'text' },
      { key: 'isActive', label: 'Is active', type: 'boolean' },
      { key: 'sortOrder', label: 'Sort order', type: 'number' },
      { key: 'metadata', label: 'Metadata JSON', type: 'multiline' },
    ],
  },
  translations: {
    label: 'Translations',
    description: 'Localized strings for dictionary entities such as plans, goals, and scenarios.',
    idKey: 'id',
    columns: ['entityType', 'entityId', 'locale', 'fieldName', 'value'],
    editableFields: [
      { key: 'entityType', label: 'Entity type', type: 'text' },
      { key: 'entityId', label: 'Entity ID', type: 'text' },
      {
        key: 'locale',
        label: 'Locale',
        type: 'select',
        options: [
          { label: 'uk', value: 'uk' },
          { label: 'ru', value: 'ru' },
          { label: 'en', value: 'en' },
          { label: 'es', value: 'es' },
          { label: 'fr', value: 'fr' },
          { label: 'de', value: 'de' },
        ],
      },
      { key: 'fieldName', label: 'Field name', type: 'text' },
      { key: 'value', label: 'Value', type: 'multiline' },
    ],
  },
  features: {
    label: 'Features',
    description: 'Feature catalog used by plans.',
    idKey: 'id',
    columns: ['slug', 'name', 'featureType', 'category'],
    editableFields: [
      { key: 'slug', label: 'Slug', type: 'text' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'multiline' },
      { key: 'featureType', label: 'Feature type', type: 'select', options: FEATURE_TYPE_OPTIONS },
      { key: 'defaultValue', label: 'Default value JSON', type: 'multiline' },
      { key: 'category', label: 'Category', type: 'select', optionsSource: 'featureCategories' },
    ],
  },
  planFeatures: {
    label: 'Plan Features',
    description: 'Feature values assigned to each plan.',
    idKey: 'id',
    columns: ['planId', 'featureId', 'value'],
    editableFields: [
      { key: 'planId', label: 'Plan', type: 'select', optionsSource: 'plans' },
      { key: 'featureId', label: 'Feature', type: 'select', optionsSource: 'features' },
      { key: 'value', label: 'Value JSON', type: 'multiline' },
    ],
  },
  storyGoals: {
    label: 'Story Goals',
    description: 'Narrative goals shown to the writer flow.',
    idKey: 'slug',
    columns: ['slug', 'name', 'minAge', 'sortOrder'],
    createOnlyFields: [{ key: 'slug', label: 'Slug', type: 'text' }],
    editableFields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'multiline' },
      { key: 'promptGuidance', label: 'Prompt guidance', type: 'multiline' },
      { key: 'minAge', label: 'Min age', type: 'number' },
      { key: 'sortOrder', label: 'Sort order', type: 'number' },
    ],
  },
  contentPolicyRules: {
    label: 'Content Policy Rules',
    description: 'Safety and story policy guidance used in validation.',
    idKey: 'id',
    columns: ['id', 'category', 'sortOrder'],
    createOnlyFields: [{ key: 'id', label: 'ID', type: 'text' }],
    editableFields: [
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'promptGuidance', label: 'Prompt guidance', type: 'multiline' },
      { key: 'sortOrder', label: 'Sort order', type: 'number' },
    ],
  },
  ageEngineRules: {
    label: 'Age Engine Rules',
    description: 'Scene count, readability and conflict tuning by age group.',
    idKey: 'ageGroup',
    columns: ['ageGroup', 'sceneCount', 'wordRangeMin', 'wordRangeMax'],
    createOnlyFields: [{ key: 'ageGroup', label: 'Age group', type: 'text' }],
    editableFields: [
      { key: 'sceneCount', label: 'Scene count', type: 'number' },
      { key: 'wordRangeMin', label: 'Word range min', type: 'number' },
      { key: 'wordRangeMax', label: 'Word range max', type: 'number' },
      { key: 'maxSentenceLength', label: 'Max sentence length', type: 'number' },
      { key: 'dialogRatio', label: 'Dialog ratio', type: 'text' },
      { key: 'allowedConflicts', label: 'Allowed conflicts JSON', type: 'multiline' },
      { key: 'additionalRules', label: 'Additional rules', type: 'multiline' },
    ],
  },
  scenarioCards: {
    label: 'Scenario Cards',
    description: 'Top-level scenario choices available in story creation.',
    idKey: 'id',
    columns: ['id', 'nameKey', 'icon', 'sortOrder', 'isActive'],
    createOnlyFields: [{ key: 'id', label: 'ID', type: 'text' }],
    editableFields: [
      { key: 'nameKey', label: 'Name key', type: 'text' },
      { key: 'descriptionKey', label: 'Description key', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'promptGuidance', label: 'Prompt guidance', type: 'multiline' },
      { key: 'suggestedGoals', label: 'Suggested goals', type: 'multiselect', optionsSource: 'storyGoals' },
      { key: 'ageGroups', label: 'Age groups', type: 'multiselect', optionsSource: 'ageEngineRules' },
      { key: 'sortOrder', label: 'Sort order', type: 'number' },
      { key: 'isActive', label: 'Is active', type: 'boolean' },
    ],
  },
  scenarioPlotExamples: {
    label: 'Scenario Plot Examples',
    description: 'Setting examples attached to scenario cards.',
    idKey: 'id',
    columns: ['scenarioCardId', 'setting', 'sortOrder', 'isActive'],
    editableFields: [
      { key: 'scenarioCardId', label: 'Scenario card', type: 'select', optionsSource: 'scenarioCards' },
      { key: 'setting', label: 'Setting', type: 'multiline' },
      { key: 'sortOrder', label: 'Sort order', type: 'number' },
      { key: 'isActive', label: 'Is active', type: 'boolean' },
    ],
  },
  scenarioWorldRules: {
    label: 'Scenario World Rules',
    description: 'World constraints and canon rules attached to scenario cards.',
    idKey: 'id',
    columns: ['scenarioCardId', 'name', 'sortOrder', 'isActive'],
    editableFields: [
      { key: 'scenarioCardId', label: 'Scenario card', type: 'select', optionsSource: 'scenarioCards' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'multiline' },
      { key: 'sortOrder', label: 'Sort order', type: 'number' },
      { key: 'isActive', label: 'Is active', type: 'boolean' },
    ],
  },
};

const RESOURCE_ORDER: AdminContentConfigResource[] = [
  'plans',
  'translations',
  'features',
  'planFeatures',
  'storyGoals',
  'contentPolicyRules',
  'ageEngineRules',
  'scenarioCards',
  'scenarioPlotExamples',
  'scenarioWorldRules',
];

function toDraftValue(value: unknown, type: FieldType): DraftValue {
  if (type === 'boolean') return value === true;
  if (type === 'multiselect') {
    if (Array.isArray(value)) {
      return value.map((item) => String(item));
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
      } catch {
        return [];
      }
    }
    return [];
  }
  if (value != null && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  if (value == null) return '';
  return String(value);
}

function toCellValue(value: unknown) {
  if (value == null) return 'n/a';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text =
    typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

function buildPatch(
  editableFields: ResourceConfig['editableFields'],
  draft: Record<string, DraftValue>,
): Record<string, unknown> {
  return Object.fromEntries(
    editableFields.map((field) => {
      if (field.type === 'boolean') {
        return [field.key, draft[field.key] === true];
      }
      if (field.type === 'multiselect') {
        return [field.key, JSON.stringify(Array.isArray(draft[field.key]) ? draft[field.key] : [])];
      }
      if (field.type === 'number') {
        return [field.key, Number(draft[field.key] ?? 0)];
      }
      return [field.key, String(draft[field.key] ?? '')];
    }),
  );
}

function getDynamicOptions(
  field: ResourceConfig['editableFields'][number],
  params: {
    ageEngineRulesItems: Array<Record<string, unknown>>;
    scenarioCardItems: Array<Record<string, unknown>>;
    storyGoalItems: Array<Record<string, unknown>>;
    planItems: Array<Record<string, unknown>>;
    featureItems: Array<Record<string, unknown>>;
    featureCategoryOptions: SelectOption[];
  },
): SelectOption[] {
  if (field.options) return field.options;
  if (field.optionsSource === 'ageEngineRules') {
    return params.ageEngineRulesItems.map((item) => ({
      label: String(item.ageGroup ?? ''),
      value: String(item.ageGroup ?? ''),
    }));
  }
  if (field.optionsSource === 'scenarioCards') {
    return params.scenarioCardItems.map((item) => {
      const id = String(item.id ?? '');
      const nameKey = String(item.nameKey ?? '');
      return {
        label: nameKey || id,
        value: id,
      };
    });
  }
  if (field.optionsSource === 'storyGoals') {
    return params.storyGoalItems.map((item) => {
      const slug = String(item.slug ?? '');
      const name = String(item.name ?? '');
      return {
        label: name || slug,
        value: slug,
      };
    });
  }
  if (field.optionsSource === 'plans') {
    return params.planItems.map((item) => {
      const id = String(item.id ?? '');
      const name = String(item.name ?? '');
      return { label: name || id, value: id };
    });
  }
  if (field.optionsSource === 'features') {
    return params.featureItems.map((item) => {
      const id = String(item.id ?? '');
      const name = String(item.name ?? '');
      return { label: name || id, value: id };
    });
  }
  if (field.optionsSource === 'featureCategories') {
    return params.featureCategoryOptions;
  }
  return [];
}

function getSelectedOptionLabel(options: SelectOption[], value: DraftValue | undefined) {
  const selected = options.find((option) => option.value === value);
  return selected?.label ?? 'Select value';
}

function getSelectedOptionLabels(options: SelectOption[], value: DraftValue | undefined) {
  const selectedValues = Array.isArray(value) ? value : [];
  if (selectedValues.length === 0) return 'No values selected';

  const labels = selectedValues.map((selectedValue) => {
    const option = options.find((item) => item.value === selectedValue);
    return option?.label ?? selectedValue;
  });

  return labels.join(', ');
}

function resolveDisplayValue(params: {
  resource: AdminContentConfigResource;
  column: string;
  value: unknown;
  planItems: Array<Record<string, unknown>>;
  featureItems: Array<Record<string, unknown>>;
}) {
  const { resource, column, value, planItems, featureItems } = params;

  if (resource === 'planFeatures' && column === 'planId') {
    const match = planItems.find((item) => String(item.id ?? '') === String(value ?? ''));
    return match?.name ?? value;
  }

  if (resource === 'planFeatures' && column === 'featureId') {
    const match = featureItems.find((item) => String(item.id ?? '') === String(value ?? ''));
    return match?.name ?? value;
  }

  return value;
}

export default function AdminContentConfigScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const [resource, setResource] = useState<AdminContentConfigResource>('storyGoals');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [openFieldKey, setOpenFieldKey] = useState<string | null>(null);
  const query = useAdminContentConfig(resource);
  const plansQuery = useAdminContentConfig('plans');
  const featuresQuery = useAdminContentConfig('features');
  const ageEngineRulesQuery = useAdminContentConfig('ageEngineRules');
  const scenarioCardsQuery = useAdminContentConfig('scenarioCards');
  const storyGoalsQuery = useAdminContentConfig('storyGoals');
  const updateItem = useUpdateAdminContentConfig();
  const createItem = useCreateAdminContentConfig();
  const deleteItem = useDeleteAdminContentConfig();
  const config = RESOURCE_CONFIGS[resource];
  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const planItems = useMemo(() => plansQuery.data?.items ?? [], [plansQuery.data?.items]);
  const featureItems = useMemo(() => featuresQuery.data?.items ?? [], [featuresQuery.data?.items]);
  const featureCategoryOptions = useMemo(
    () =>
      [...new Set(featureItems.map((item) => String(item.category ?? '')).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .map((category) => ({ label: category, value: category })),
    [featureItems],
  );
  const ageEngineRulesItems = useMemo(() => ageEngineRulesQuery.data?.items ?? [], [ageEngineRulesQuery.data?.items]);
  const scenarioCardItems = useMemo(() => scenarioCardsQuery.data?.items ?? [], [scenarioCardsQuery.data?.items]);
  const storyGoalItems = useMemo(() => storyGoalsQuery.data?.items ?? [], [storyGoalsQuery.data?.items]);

  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    return (
      items.find((item) => String(item[config.idKey] ?? '') === selectedId) ?? null
    );
  }, [config.idKey, items, selectedId]);

  useEffect(() => {
    setSelectedId(null);
    setIsCreating(false);
    setDraft({});
    setOpenFieldKey(null);
  }, [resource]);

  useEffect(() => {
    const formFields = [...(config.createOnlyFields ?? []), ...config.editableFields];

    if (isCreating) {
      setDraft(
        Object.fromEntries(
          formFields.map((field) => [field.key, toDraftValue(undefined, field.type)]),
        ),
      );
      setOpenFieldKey(null);
      return;
    }

    if (!selectedItem) {
      setDraft({});
      setOpenFieldKey(null);
      return;
    }

    setDraft(
      Object.fromEntries(
        formFields.map((field) => [field.key, toDraftValue(selectedItem[field.key], field.type)]),
      ),
    );
  }, [config.createOnlyFields, config.editableFields, isCreating, selectedItem]);

  const formFields = useMemo(
    () => [...(config.createOnlyFields ?? []), ...config.editableFields],
    [config.createOnlyFields, config.editableFields],
  );

  const rows = items.map((item) => [
    ...config.columns.map((column) =>
      toCellValue(
        resolveDisplayValue({
          resource,
          column,
          value: item[column],
          planItems,
          featureItems,
        }),
      ),
    ),
    <TouchableOpacity
      key={`${resource}-${String(item[config.idKey])}-edit`}
      style={styles.editButton}
      onPress={() => {
        setSelectedId(String(item[config.idKey] ?? ''));
        setIsCreating(false);
      }}
    >
      <Text style={styles.editButtonText}>Edit</Text>
    </TouchableOpacity>,
    <TouchableOpacity
      key={`${resource}-${String(item[config.idKey])}-delete`}
      style={styles.deleteButton}
      onPress={async () => {
        const recordId = String(item[config.idKey] ?? '');
        const confirmed = typeof globalThis.confirm === 'function'
          ? globalThis.confirm(`Delete this ${config.label} record?`)
          : true;
        if (!confirmed) return;

        await deleteItem.mutateAsync({
          resource,
          id: recordId,
        });

        if (selectedId === recordId) {
          setSelectedId(null);
          setIsCreating(false);
        }
      }}
    >
      <Text style={styles.deleteButtonText}>Delete</Text>
    </TouchableOpacity>,
  ]);

  return (
    <AdminLayout navigation={navigation} activeRoute="AdminContentConfig" title="Admin / Content Config">
      <View style={styles.resourcePicker}>
        {RESOURCE_ORDER.map((key) => {
          const item = RESOURCE_CONFIGS[key];
          const isActive = key === resource;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.resourceChip, isActive && styles.resourceChipActive]}
              onPress={() => setResource(key)}
            >
              <Text style={[styles.resourceChipText, isActive && styles.resourceChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.headerBlock}>
        <Text style={styles.sectionTitle}>{config.label}</Text>
        <Text style={styles.sectionDescription}>{config.description}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setSelectedId(null);
            setIsCreating(true);
          }}
        >
          <Text style={styles.addButtonText}>Add item</Text>
        </TouchableOpacity>
      </View>

      {query.isLoading ? <AdminLoadingState /> : null}
      {query.error ? <AdminErrorState message={(query.error as Error).message} /> : null}

      {!query.isLoading && !query.error ? (
        <View style={styles.contentShell}>
          <View style={styles.tableColumn}>
            <AdminTable
              headers={[...config.columns, 'Edit', 'Delete']}
              rows={rows}
              emptyText="No items found."
            />
          </View>

          <View style={styles.editorColumn}>
            {selectedItem || isCreating ? (
              <ScrollView
                style={[styles.editorScroll, Platform.OS === 'web' && styles.editorScrollWeb]}
                contentContainerStyle={styles.editorPanel}
              >
                <Text style={styles.editorTitle}>{isCreating ? 'Add item' : 'Edit item'}</Text>
                <Text style={styles.editorMeta}>{isCreating ? 'New record' : selectedId}</Text>

                {formFields.map((field) => (
                  <View key={field.key} style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    {field.type === 'boolean' ? (
                      <View style={styles.booleanRow}>
                        {[true, false].map((option) => {
                          const isSelected = draft[field.key] === option;
                          return (
                            <TouchableOpacity
                              key={`${field.key}-${String(option)}`}
                              style={[styles.booleanChip, isSelected && styles.booleanChipActive]}
                              onPress={() => setDraft((current) => ({ ...current, [field.key]: option }))}
                            >
                              <Text style={[styles.booleanChipText, isSelected && styles.booleanChipTextActive]}>
                                {option ? 'True' : 'False'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : field.type === 'select' ? (
                      <View style={styles.selectGroup}>
                        <TouchableOpacity
                          style={styles.selectTrigger}
                          onPress={() => setOpenFieldKey((current) => (current === field.key ? null : field.key))}
                        >
                          <Text style={styles.selectTriggerText}>
                            {getSelectedOptionLabel(
                              getDynamicOptions(field, {
                                ageEngineRulesItems,
                              scenarioCardItems,
                              storyGoalItems,
                              planItems,
                              featureItems,
                              featureCategoryOptions,
                            }),
                              draft[field.key],
                            )}
                          </Text>
                          <Text style={styles.selectChevron}>{openFieldKey === field.key ? '▲' : '▼'}</Text>
                        </TouchableOpacity>

                        {openFieldKey === field.key ? (
                          <View style={styles.selectMenu}>
                            {getDynamicOptions(field, {
                              ageEngineRulesItems,
                              scenarioCardItems,
                              storyGoalItems,
                              planItems,
                              featureItems,
                              featureCategoryOptions,
                            }).map((option) => {
                              const isSelected = draft[field.key] === option.value;
                              return (
                                <TouchableOpacity
                                  key={`${field.key}-${option.value}`}
                                  style={[styles.selectOption, isSelected && styles.selectOptionActive]}
                                  onPress={() => {
                                    setDraft((current) => ({ ...current, [field.key]: option.value }));
                                    setOpenFieldKey(null);
                                  }}
                                >
                                  <Text style={[styles.selectOptionText, isSelected && styles.selectOptionTextActive]}>
                                    {option.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    ) : field.type === 'multiselect' ? (
                      <View style={styles.selectGroup}>
                        <TouchableOpacity
                          style={styles.selectTrigger}
                          onPress={() => setOpenFieldKey((current) => (current === field.key ? null : field.key))}
                        >
                          <Text style={styles.selectTriggerText}>
                            {getSelectedOptionLabels(
                              getDynamicOptions(field, {
                                ageEngineRulesItems,
                                scenarioCardItems,
                                storyGoalItems,
                                planItems,
                                featureItems,
                                featureCategoryOptions,
                              }),
                              draft[field.key],
                            )}
                          </Text>
                          <Text style={styles.selectChevron}>{openFieldKey === field.key ? '▲' : '▼'}</Text>
                        </TouchableOpacity>

                        {openFieldKey === field.key ? (
                          <View style={styles.selectMenu}>
                            {getDynamicOptions(field, {
                              ageEngineRulesItems,
                              scenarioCardItems,
                              storyGoalItems,
                              planItems,
                              featureItems,
                              featureCategoryOptions,
                            }).map((option) => {
                              const selectedValues = (Array.isArray(draft[field.key]) ? draft[field.key] : []) as string[];
                              const isSelected = selectedValues.includes(option.value);
                              return (
                                <TouchableOpacity
                                  key={`${field.key}-${option.value}`}
                                  style={[styles.selectOption, isSelected && styles.selectOptionActive]}
                                  onPress={() => {
                                    setDraft((current) => {
                                      const currentValues = (Array.isArray(current[field.key]) ? current[field.key] : []) as string[];
                                      const nextValues = currentValues.includes(option.value)
                                        ? currentValues.filter((value: string) => value !== option.value)
                                        : [...currentValues, option.value];
                                      return { ...current, [field.key]: nextValues };
                                    });
                                  }}
                                >
                                  <Text style={[styles.selectOptionText, isSelected && styles.selectOptionTextActive]}>
                                    {isSelected ? '✓ ' : ''}
                                    {option.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <TextInput
                        style={[styles.input, field.type === 'multiline' && styles.multilineInput]}
                        value={String(draft[field.key] ?? '')}
                        onChangeText={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
                        multiline={field.type === 'multiline'}
                        autoCapitalize="none"
                        autoCorrect={false}
                        textAlignVertical="top"
                      />
                    )}
                  </View>
                ))}

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                      setSelectedId(null);
                      setIsCreating(false);
                    }}
                    disabled={updateItem.isPending || createItem.isPending}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  {!isCreating && selectedId ? (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      disabled={deleteItem.isPending}
                      onPress={async () => {
                        const confirmed = typeof globalThis.confirm === 'function'
                          ? globalThis.confirm(`Delete this ${config.label} record?`)
                          : true;
                        if (!confirmed) return;

                        await deleteItem.mutateAsync({
                          resource,
                          id: selectedId,
                        });
                        setSelectedId(null);
                        setIsCreating(false);
                      }}
                    >
                      <Text style={styles.deleteButtonText}>
                        {deleteItem.isPending ? 'Deleting...' : 'Delete'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.primaryButton}
                    disabled={
                      updateItem.isPending ||
                      createItem.isPending ||
                      deleteItem.isPending ||
                      (!isCreating && !selectedId)
                    }
                    onPress={async () => {
                      const payload = buildPatch(formFields, draft);
                      if (isCreating) {
                        await createItem.mutateAsync({
                          resource,
                          payload,
                        });
                        setIsCreating(false);
                        setSelectedId(null);
                        return;
                      }

                      if (!selectedId) return;
                      await updateItem.mutateAsync({
                        resource,
                        id: selectedId,
                        patch: buildPatch(config.editableFields, draft),
                      });
                    }}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isCreating
                        ? (createItem.isPending ? 'Creating...' : 'Create')
                        : (updateItem.isPending ? 'Saving...' : 'Save')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <View style={[styles.placeholderPanel, Platform.OS === 'web' && styles.editorScrollWeb]}>
                <Text style={styles.placeholderTitle}>Select a row to edit</Text>
                <Text style={styles.placeholderText}>
                  Start with the table on the left, or create a new row with the add button.
                </Text>
              </View>
            )}
          </View>
        </View>
      ) : null}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  resourcePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resourceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  resourceChipActive: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  resourceChipText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  resourceChipTextActive: {
    color: theme.colors.text.inverse,
  },
  headerBlock: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  sectionDescription: {
    color: theme.colors.text.secondary,
  },
  contentShell: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
    flex: 1,
    minHeight: 0,
  },
  tableColumn: {
    flex: 1.4,
    minWidth: 0,
    minHeight: 0,
  },
  editorColumn: {
    flex: 1,
    minWidth: 320,
    minHeight: 0,
  },
  editorScroll: {
    width: '100%',
    minHeight: 0,
  },
  editorScrollWeb: {
    width: '100%',
    alignSelf: 'flex-start',
    // @ts-ignore - position: sticky is web-only
    position: 'sticky',
    top: 24,
    // @ts-ignore - calc() is web-only
    maxHeight: 'calc(100vh - 168px)',
  },
  editButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.interactive.secondary,
  },
  editButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  deleteButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.status.error,
  },
  deleteButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '600',
  },
  editorPanel: {
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 12,
    padding: 16,
    backgroundColor: theme.colors.background.secondary,
  },
  editorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  editorMeta: {
    color: theme.colors.text.secondary,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.primary,
  },
  multilineInput: {
    minHeight: 120,
  },
  booleanRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectGroup: {
    gap: 8,
  },
  selectTrigger: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.background.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectTriggerText: {
    flex: 1,
    color: theme.colors.text.primary,
  },
  selectChevron: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  selectMenu: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 10,
    backgroundColor: theme.colors.background.primary,
    overflow: 'hidden',
  },
  selectOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
  },
  selectOptionActive: {
    backgroundColor: theme.colors.primary[50],
  },
  selectOptionText: {
    color: theme.colors.text.primary,
    fontWeight: '500',
  },
  selectOptionTextActive: {
    color: theme.colors.interactive.primary,
    fontWeight: '700',
  },
  booleanChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.primary,
  },
  booleanChipActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  booleanChipText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  booleanChipTextActive: {
    color: theme.colors.interactive.primary,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.primary,
  },
  optionChipActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  optionChipText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: theme.colors.interactive.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.secondary,
  },
  secondaryButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  primaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.primary,
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '600',
  },
  placeholderPanel: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 12,
    padding: 16,
    backgroundColor: theme.colors.background.secondary,
    gap: 8,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  placeholderText: {
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  addButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.primary,
  },
  addButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '600',
  },
});
