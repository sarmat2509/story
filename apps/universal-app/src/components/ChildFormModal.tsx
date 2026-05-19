import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChildFormContent, type ChildFormInitialData } from './ChildFormContent';
import { FeedbackModal } from './FeedbackModal';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  childId?: string;
  initialData?: ChildFormInitialData;
}

export function ChildFormModal({ visible, onClose, childId, initialData }: Props) {
  const { t } = useTranslation();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {visible && (
            <>
              <View style={styles.modalContent}>
                <ChildFormContent
                  key={childId || 'new'}
                  childId={childId}
                  initialData={initialData}
                  onSuccess={onClose}
                  onCancel={onClose}
                  variant="modal"
                />
              </View>
              <TouchableOpacity
                style={styles.reportProblemLink}
                onPress={() => setShowFeedbackModal(true)}
              >
                <Text style={styles.reportProblemLinkText}>{t('profile.report_problem')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="children"
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[4],
  },
  modal: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.lg,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalContent: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  reportProblemLink: {
    alignSelf: 'center',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  reportProblemLinkText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
});
