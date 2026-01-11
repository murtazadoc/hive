import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import api from '../api/client';

// =====================================================
// TYPES
// =====================================================
export interface ReportContentProps {
  contentType: 'product' | 'reel' | 'business' | 'comment';
  contentId: string;
  onClose?: () => void;
}

const REPORT_REASONS = [
  { id: 'inappropriate', label: 'Inappropriate content', icon: 'alert-triangle' },
  { id: 'spam', label: 'Spam or misleading', icon: 'mail' },
  { id: 'fake', label: 'Fake or counterfeit', icon: 'x-circle' },
  { id: 'harassment', label: 'Harassment or hate', icon: 'shield-off' },
  { id: 'violence', label: 'Violence or dangerous', icon: 'alert-octagon' },
  { id: 'illegal', label: 'Illegal activity', icon: 'slash' },
  { id: 'ip', label: 'Intellectual property', icon: 'lock' },
  { id: 'other', label: 'Other', icon: 'more-horizontal' },
];

// =====================================================
// REPORT CONTENT COMPONENT
// =====================================================
export function ReportContent({ contentType, contentId, onClose }: ReportContentProps) {
  const [visible, setVisible] = useState(true);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Please select a reason');
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post('/reports', {
        contentType,
        contentId,
        reason: selectedReason,
        description: description.trim() || undefined,
      });

      setSubmitted(true);
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to submit report'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setVisible(false);
    onClose?.();
  };

  if (submitted) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Icon name="check" size={32} color="#fff" />
              </View>
              <Text style={styles.successTitle}>Report Submitted</Text>
              <Text style={styles.successText}>
                Thank you for helping keep Hive safe. We'll review this content
                and take action if necessary.
              </Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Report Content</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Icon name="x" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Reason Selection */}
          <Text style={styles.subtitle}>Why are you reporting this?</Text>
          <View style={styles.reasons}>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.id}
                style={[
                  styles.reasonItem,
                  selectedReason === reason.id && styles.reasonItemSelected,
                ]}
                onPress={() => setSelectedReason(reason.id)}
              >
                <Icon
                  name={reason.icon}
                  size={20}
                  color={selectedReason === reason.id ? '#F59E0B' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.reasonText,
                    selectedReason === reason.id && styles.reasonTextSelected,
                  ]}
                >
                  {reason.label}
                </Text>
                {selectedReason === reason.id && (
                  <Icon name="check" size={20} color="#F59E0B" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Description */}
          {selectedReason && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionLabel}>
                Additional details (optional)
              </Text>
              <TextInput
                style={styles.descriptionInput}
                multiline
                numberOfLines={4}
                placeholder="Provide more context about this report..."
                placeholderTextColor="#9CA3AF"
                value={description}
                onChangeText={setDescription}
              />
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!selectedReason || isSubmitting) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!selectedReason || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Report</Text>
            )}
          </TouchableOpacity>

          {/* Disclaimer */}
          <Text style={styles.disclaimer}>
            False reports may result in action against your account.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// =====================================================
// REPORT BUTTON (for use in content screens)
// =====================================================
export function ReportButton({
  contentType,
  contentId,
  style,
}: {
  contentType: 'product' | 'reel' | 'business' | 'comment';
  contentId: string;
  style?: any;
}) {
  const [showReport, setShowReport] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.reportButton, style]}
        onPress={() => setShowReport(true)}
      >
        <Icon name="flag" size={20} color="#6B7280" />
      </TouchableOpacity>

      {showReport && (
        <ReportContent
          contentType={contentType}
          contentId={contentId}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}

// =====================================================
// ACTION SHEET HELPER
// =====================================================
export function showReportActionSheet(
  contentType: 'product' | 'reel' | 'business' | 'comment',
  contentId: string,
  onReport: () => void,
) {
  Alert.alert(
    'Report Content',
    'Would you like to report this content?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: onReport,
      },
    ]
  );
}

// =====================================================
// STYLES
// =====================================================
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  reasons: {
    gap: 8,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    gap: 12,
  },
  reasonItemSelected: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  reasonText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
  },
  reasonTextSelected: {
    color: '#B45309',
    fontWeight: '500',
  },
  descriptionContainer: {
    marginTop: 20,
  },
  descriptionLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  descriptionInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#111827',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 12,
  },
  successContainer: {
    alignItems: 'center',
    padding: 20,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  doneButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    marginTop: 24,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  reportButton: {
    padding: 8,
  },
});

export default ReportContent;
