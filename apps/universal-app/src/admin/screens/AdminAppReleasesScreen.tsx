import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import {
  LOCALE_IDS,
  type AppReleaseChange,
  type AppReleaseEmailBlock,
  type AppReleaseInput,
  type AppReleaseLocalizationInput,
  type AppReleaseStatus,
} from '@wondertales/shared';
import {
  fetchAdminAppReleaseEmailPreview,
  type AdminAppReleaseDetail,
  useAdminAppRelease,
  useAdminAppReleases,
  useCreateAdminAppRelease,
  useDeleteAdminAppReleaseMedia,
  useUpdateAdminAppRelease,
  useUploadAdminAppReleaseMedia,
} from '@/admin/api/admin';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { AdminTable } from '@/admin/components/AdminTable';
import { AppButton } from '@/components/AppButton';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

const EMAIL_BLOCK_TYPES = ['paragraph', 'heading', 'list', 'button', 'image'] as const;

function localId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function blankTranslation(locale: (typeof LOCALE_IDS)[number]): AppReleaseLocalizationInput {
  return {
    locale,
    title: '',
    changes: [{ id: localId('change'), kind: 'new', title: '', description: '' }],
    emailSubject: '',
    emailPreheader: '',
    emailBody: [{ id: localId('block'), type: 'paragraph', text: '' }],
  };
}

function blankForm(): AppReleaseInput {
  return {
    version: null,
    releaseDate: new Date().toISOString().slice(0, 10),
    status: 'draft',
    translations: LOCALE_IDS.map(blankTranslation),
  };
}

function detailToInput(detail: AdminAppReleaseDetail): AppReleaseInput {
  return {
    version: detail.version,
    releaseDate: detail.releaseDate,
    status: detail.status,
    translations: LOCALE_IDS.map((locale) => {
      const translation = detail.translations.find((item) => item.locale === locale);
      return translation ? { ...translation, locale } : blankTranslation(locale);
    }),
  };
}

function newEmailBlock(type: (typeof EMAIL_BLOCK_TYPES)[number]): AppReleaseEmailBlock {
  const id = localId('block');
  if (type === 'list') return { id, type, items: [''] };
  if (type === 'button') return { id, type, label: '', url: '' };
  if (type === 'image') return { id, type, mediaId: '', alt: '', caption: '' };
  return { id, type, text: '' };
}

function requestError(error: unknown): string | null {
  if (!error) return null;
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (error instanceof Error ? error.message : 'Request failed')
  );
}

export default function AdminAppReleasesScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const releases = useAdminAppReleases();
  const createRelease = useCreateAdminAppRelease();
  const updateRelease = useUpdateAdminAppRelease();
  const uploadMedia = useUploadAdminAppReleaseMedia();
  const deleteMedia = useDeleteAdminAppReleaseMedia();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const detail = useAdminAppRelease(editingId && editingId !== 'new' ? editingId : undefined);
  const [activeLocale, setActiveLocale] = useState<(typeof LOCALE_IDS)[number]>('en');
  const [form, setForm] = useState<AppReleaseInput>(blankForm);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (detail.data && detail.data.id === editingId) setForm(detailToInput(detail.data));
  }, [detail.data, editingId]);

  const translation = useMemo(
    () => form.translations.find((item) => item.locale === activeLocale)!,
    [activeLocale, form.translations]
  );

  const patchTranslation = (patch: Partial<AppReleaseLocalizationInput>) => {
    setForm((current) => ({
      ...current,
      translations: current.translations.map((item) =>
        item.locale === activeLocale ? { ...item, ...patch } : item
      ),
    }));
  };

  const updateChange = (index: number, patch: Partial<AppReleaseChange>) => {
    patchTranslation({
      changes: translation.changes.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    });
  };

  const updateBlock = (index: number, block: AppReleaseEmailBlock) => {
    patchTranslation({
      emailBody: translation.emailBody.map((item, itemIndex) =>
        itemIndex === index ? block : item
      ),
    });
  };

  const beginNew = () => {
    setEditingId('new');
    setForm(blankForm());
    setActiveLocale('en');
    setNotice(null);
  };

  const save = async () => {
    setNotice(null);
    try {
      const saved =
        editingId === 'new'
          ? await createRelease.mutateAsync(form)
          : await updateRelease.mutateAsync({ id: editingId!, input: form });
      setEditingId(saved.id);
      setForm(detailToInput(saved));
      setNotice('Saved. Public changes and email content are complete in all seven locales.');
    } catch {
      // Mutation error is rendered below.
    }
  };

  const previewEmail = async () => {
    if (!editingId || editingId === 'new' || Platform.OS !== 'web') return;
    try {
      const html = await fetchAdminAppReleaseEmailPreview(editingId, activeLocale);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setNotice(requestError(error));
    }
  };

  const pickImage = async () => {
    if (!editingId || editingId === 'new') {
      setNotice('Save the release as a draft before uploading images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const fileName = asset.fileName || 'release-image.jpg';
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
      // @ts-ignore Browser FormData accepts a Blob/File plus filename.
      formData.append('file', blob, fileName);
    } else {
      // The admin is web-only, but keeping this shape makes the helper explicit.
      formData.append('file', {
        uri: asset.uri,
        name: fileName,
        type: asset.mimeType || 'image/jpeg',
      } as any);
    }
    await uploadMedia.mutateAsync({ releaseId: editingId, formData });
    setNotice('Image uploaded. Add an image block to the email and select it.');
  };

  const media = detail.data?.media ?? [];
  const rows = (releases.data ?? []).map((release) => [
    release.releaseDate,
    release.version || '—',
    release.status,
    `${release.translationCount}/7`,
    `r${release.contentRevision}`,
    <TouchableOpacity
      key={`${release.id}-edit`}
      style={styles.smallButton}
      onPress={() => {
        setEditingId(release.id);
        setActiveLocale('en');
        setNotice(null);
      }}
    >
      <Text style={styles.smallButtonText}>Edit</Text>
    </TouchableOpacity>,
  ]);
  const saveError = requestError(
    createRelease.error ?? updateRelease.error ?? uploadMedia.error ?? deleteMedia.error
  );
  const saving = createRelease.isPending || updateRelease.isPending;

  return (
    <AdminLayout navigation={navigation} activeRoute="AdminAppReleases" title="Admin / Updates">
      <View style={styles.toolbar}>
        <Text style={styles.description}>
          Manage the dated public release notes and richer email content. Every save requires all
          seven languages.
        </Text>
        <AppButton label="New update" onPress={beginNew} size="sm" />
      </View>
      {releases.isLoading ? <AdminLoadingState /> : null}
      {releases.error ? <AdminErrorState message={(releases.error as Error).message} /> : null}
      {!releases.isLoading && !releases.error ? (
        <AdminTable
          headers={['Date', 'Version', 'Status', 'Locales', 'Revision', 'Edit']}
          rows={rows}
          emptyText="No updates yet."
        />
      ) : null}

      {editingId ? (
        <View style={styles.editor}>
          <View style={styles.editorHeader}>
            <Text style={styles.editorTitle}>
              {editingId === 'new' ? 'New update' : 'Edit update'}
            </Text>
            <TouchableOpacity onPress={() => setEditingId(null)}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
          {detail.isLoading && editingId !== 'new' ? <AdminLoadingState /> : null}
          <View style={styles.metadataRow}>
            <Field
              label="Release date"
              value={form.releaseDate}
              onChangeText={(releaseDate) => setForm({ ...form, releaseDate })}
            />
            <Field
              label="Version (optional)"
              value={form.version ?? ''}
              onChangeText={(version) => setForm({ ...form, version: version || null })}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.chips}>
                {(['draft', 'published', 'archived'] as AppReleaseStatus[]).map((status) => (
                  <Chip
                    key={status}
                    label={status}
                    active={form.status === status}
                    onPress={() => setForm({ ...form, status })}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.localeTabs}>
            {LOCALE_IDS.map((locale) => (
              <Chip
                key={locale}
                label={locale.toUpperCase()}
                active={activeLocale === locale}
                onPress={() => setActiveLocale(locale)}
              />
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Public /updates content · {activeLocale.toUpperCase()}
            </Text>
            <Field
              label="Release title"
              value={translation.title}
              onChangeText={(title) => patchTranslation({ title })}
            />
            {translation.changes.map((change, index) => (
              <View key={change.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Change {index + 1}</Text>
                  <RemoveButton
                    onPress={() =>
                      patchTranslation({
                        changes: translation.changes.filter((_, i) => i !== index),
                      })
                    }
                  />
                </View>
                <View style={styles.chips}>
                  {(['new', 'improved', 'fixed'] as const).map((kind) => (
                    <Chip
                      key={kind}
                      label={kind}
                      active={change.kind === kind}
                      onPress={() => updateChange(index, { kind })}
                    />
                  ))}
                </View>
                <Field
                  label="Title"
                  value={change.title}
                  onChangeText={(title) => updateChange(index, { title })}
                />
                <Field
                  label="Short description"
                  value={change.description}
                  onChangeText={(description) => updateChange(index, { description })}
                  multiline
                />
                <Field
                  label="Blog URL (optional)"
                  value={change.blogUrl ?? ''}
                  onChangeText={(blogUrl) => updateChange(index, { blogUrl })}
                />
                <Field
                  label="App URL (optional)"
                  value={change.appUrl ?? ''}
                  onChangeText={(appUrl) => updateChange(index, { appUrl })}
                />
              </View>
            ))}
            <AppButton
              label="Add public change"
              size="sm"
              variant="secondary"
              onPress={() =>
                patchTranslation({
                  changes: [
                    ...translation.changes,
                    { id: localId('change'), kind: 'new', title: '', description: '' },
                  ],
                })
              }
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Email content · {activeLocale.toUpperCase()}</Text>
            <Text style={styles.hint}>
              Stored and previewed only. This implementation does not send a campaign.
            </Text>
            <Field
              label="Subject"
              value={translation.emailSubject}
              onChangeText={(emailSubject) => patchTranslation({ emailSubject })}
            />
            <Field
              label="Preheader"
              value={translation.emailPreheader}
              onChangeText={(emailPreheader) => patchTranslation({ emailPreheader })}
            />
            <View style={styles.mediaToolbar}>
              <AppButton
                label={uploadMedia.isPending ? 'Uploading…' : 'Upload image'}
                size="sm"
                variant="secondary"
                onPress={pickImage}
                disabled={uploadMedia.isPending}
              />
              <Text style={styles.hint}>{media.length} image(s)</Text>
            </View>
            {media.length > 0 ? (
              <View style={styles.mediaGrid}>
                {media.map((item) => (
                  <View key={item.id} style={styles.mediaCard}>
                    <Image source={{ uri: item.publicUrl }} style={styles.mediaImage} />
                    <Text numberOfLines={1} style={styles.mediaId}>
                      {item.id}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        editingId !== 'new' &&
                        deleteMedia.mutate({ releaseId: editingId!, mediaId: item.id })
                      }
                    >
                      <Text style={styles.removeText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
            {translation.emailBody.map((block, index) => (
              <View key={block.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Email block {index + 1}</Text>
                  <RemoveButton
                    onPress={() =>
                      patchTranslation({
                        emailBody: translation.emailBody.filter((_, i) => i !== index),
                      })
                    }
                  />
                </View>
                <View style={styles.chips}>
                  {EMAIL_BLOCK_TYPES.map((type) => (
                    <Chip
                      key={type}
                      label={type}
                      active={block.type === type}
                      onPress={() => updateBlock(index, newEmailBlock(type))}
                    />
                  ))}
                </View>
                {block.type === 'heading' || block.type === 'paragraph' ? (
                  <Field
                    label="Text"
                    value={block.text}
                    multiline={block.type === 'paragraph'}
                    onChangeText={(text) => updateBlock(index, { ...block, text })}
                  />
                ) : null}
                {block.type === 'list' ? (
                  <Field
                    label="List items (one per line)"
                    value={block.items.join('\n')}
                    multiline
                    onChangeText={(value) =>
                      updateBlock(index, { ...block, items: value.split('\n') })
                    }
                  />
                ) : null}
                {block.type === 'button' ? (
                  <>
                    <Field
                      label="Button label"
                      value={block.label}
                      onChangeText={(label) => updateBlock(index, { ...block, label })}
                    />
                    <Field
                      label="Button URL"
                      value={block.url}
                      onChangeText={(url) => updateBlock(index, { ...block, url })}
                    />
                  </>
                ) : null}
                {block.type === 'image' ? (
                  <>
                    <Text style={styles.label}>Image</Text>
                    <View style={styles.chips}>
                      {media.map((item) => (
                        <Chip
                          key={item.id}
                          label={item.id.slice(0, 8)}
                          active={block.mediaId === item.id}
                          onPress={() => updateBlock(index, { ...block, mediaId: item.id })}
                        />
                      ))}
                    </View>
                    <Field
                      label="Alt text"
                      value={block.alt}
                      onChangeText={(alt) => updateBlock(index, { ...block, alt })}
                    />
                    <Field
                      label="Caption (optional)"
                      value={block.caption ?? ''}
                      onChangeText={(caption) => updateBlock(index, { ...block, caption })}
                    />
                  </>
                ) : null}
              </View>
            ))}
            <View style={styles.addBlocks}>
              {EMAIL_BLOCK_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={styles.addBlockButton}
                  onPress={() =>
                    patchTranslation({ emailBody: [...translation.emailBody, newEmailBlock(type)] })
                  }
                >
                  <Text style={styles.addBlockText}>+ {type}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {saveError ? <AdminErrorState message={saveError} /> : null}
          <View style={styles.actions}>
            <AppButton
              label={saving ? 'Saving…' : 'Save all 7 languages'}
              onPress={save}
              disabled={saving}
            />
            <AppButton
              label="Preview current email"
              variant="secondary"
              onPress={previewEmail}
              disabled={editingId === 'new'}
            />
          </View>
        </View>
      ) : null}
    </AdminLayout>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function RemoveButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress}>
      <Text style={styles.removeText}>Remove</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  description: { flex: 1, color: theme.colors.text.secondary, fontSize: 14, lineHeight: 20 },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.primary,
  },
  smallButtonText: { color: theme.colors.text.inverse, fontWeight: '700' },
  editor: {
    marginTop: 14,
    paddingTop: 22,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
    gap: 20,
  },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorTitle: { fontSize: 23, fontWeight: '800', color: theme.colors.text.primary },
  closeText: { color: theme.colors.interactive.primary, fontWeight: '700' },
  metadataRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  field: { minWidth: 210, flex: 1, gap: 6 },
  label: { color: theme.colors.text.secondary, fontSize: 13, fontWeight: '700' },
  hint: { color: theme.colors.text.tertiary, fontSize: 12, lineHeight: 17 },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.primary,
  },
  multiline: { minHeight: 92 },
  localeTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border.light,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
  },
  chipActive: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  chipText: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: theme.colors.text.inverse },
  section: {
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 14,
    backgroundColor: theme.colors.background.secondary,
  },
  sectionTitle: { color: theme.colors.text.primary, fontSize: 18, fontWeight: '800' },
  card: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 13,
    backgroundColor: theme.colors.background.primary,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '800' },
  removeText: { color: '#c2415d', fontSize: 12, fontWeight: '700' },
  mediaToolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mediaCard: {
    width: 130,
    gap: 5,
    padding: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
  },
  mediaImage: { width: 114, height: 76, borderRadius: 7, resizeMode: 'cover' },
  mediaId: { color: theme.colors.text.tertiary, fontSize: 10 },
  addBlocks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addBlockButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
  },
  addBlockText: { color: theme.colors.interactive.primary, fontSize: 12, fontWeight: '700' },
  notice: {
    padding: 12,
    borderRadius: 10,
    color: '#315f37',
    backgroundColor: '#edf8ee',
    fontSize: 13,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
