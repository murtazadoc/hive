import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Share,
  Linking,
  ActivityIndicator,
  Clipboard,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import Toast from 'react-native-toast-message';
import api from '../api/client';

// =====================================================
// TYPES
// =====================================================
export interface ShareContentProps {
  type: 'product' | 'business' | 'reel';
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  price?: number;
  businessName?: string;
}

interface ShareLinkResponse {
  code: string;
  shortUrl: string;
  whatsappUrl: string;
  shareCard: {
    title: string;
    description: string;
    imageUrl?: string;
    price?: number;
    businessName: string;
    shareUrl: string;
  };
}

// =====================================================
// SHARE BUTTON
// =====================================================
export function ShareButton({
  type,
  id,
  title,
  description,
  imageUrl,
  price,
  businessName,
  style,
  iconSize = 24,
  color = '#6B7280',
}: ShareContentProps & { style?: any; iconSize?: number; color?: string }) {
  const [showSheet, setShowSheet] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.shareButton, style]}
        onPress={() => setShowSheet(true)}
      >
        <Icon name="share-2" size={iconSize} color={color} />
      </TouchableOpacity>

      <ShareSheet
        visible={showSheet}
        onClose={() => setShowSheet(false)}
        type={type}
        id={id}
        title={title}
        description={description}
        imageUrl={imageUrl}
        price={price}
        businessName={businessName}
      />
    </>
  );
}

// =====================================================
// SHARE SHEET
// =====================================================
export function ShareSheet({
  visible,
  onClose,
  type,
  id,
  title,
  description,
  imageUrl,
  price,
  businessName,
}: ShareContentProps & { visible: boolean; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [shareData, setShareData] = useState<ShareLinkResponse | null>(null);

  const createShareLink = async () => {
    if (shareData) return shareData;

    setIsLoading(true);
    try {
      const response = await api.post('/share', {
        targetType: type,
        targetId: id,
        utmSource: 'app',
        utmMedium: 'share',
      });
      setShareData(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to create share link:', error);
      // Fallback to simple URL
      const fallbackUrl = `https://hive.co.ke/${type}s/${id}`;
      return {
        shortUrl: fallbackUrl,
        whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`${title}\n\n${fallbackUrl}`)}`,
        shareCard: {
          title,
          description,
          shareUrl: fallbackUrl,
          businessName: businessName || 'Hive',
        },
      };
    } finally {
      setIsLoading(false);
    }
  };

  const handleWhatsApp = async () => {
    const data = await createShareLink();
    if (data) {
      await Linking.openURL(data.whatsappUrl);
      onClose();
    }
  };

  const handleNativeShare = async () => {
    const data = await createShareLink();
    if (data) {
      try {
        let message = `🐝 *${data.shareCard.title}*\n\n`;
        if (data.shareCard.description) {
          message += `${data.shareCard.description}\n\n`;
        }
        if (price) {
          message += `💰 KES ${price.toLocaleString()}\n\n`;
        }
        message += `🏪 ${data.shareCard.businessName}\n\n`;
        message += `👉 ${data.shortUrl}`;

        await Share.share({
          message,
          url: data.shortUrl,
          title: data.shareCard.title,
        });
        onClose();
      } catch (error) {
        console.error('Share failed:', error);
      }
    }
  };

  const handleCopyLink = async () => {
    const data = await createShareLink();
    if (data) {
      Clipboard.setString(data.shortUrl);
      Toast.show({
        type: 'success',
        text1: 'Link copied!',
        text2: 'Share it anywhere',
        position: 'bottom',
      });
      onClose();
    }
  };

  const handleSMS = async () => {
    const data = await createShareLink();
    if (data) {
      const message = `Check out ${title} on Hive! ${data.shortUrl}`;
      const url = Platform.OS === 'ios'
        ? `sms:&body=${encodeURIComponent(message)}`
        : `sms:?body=${encodeURIComponent(message)}`;
      await Linking.openURL(url);
      onClose();
    }
  };

  const handleTelegram = async () => {
    const data = await createShareLink();
    if (data) {
      const message = `🐝 ${title}\n\n${data.shortUrl}`;
      const url = `https://t.me/share/url?url=${encodeURIComponent(data.shortUrl)}&text=${encodeURIComponent(message)}`;
      await Linking.openURL(url);
      onClose();
    }
  };

  const handleTwitter = async () => {
    const data = await createShareLink();
    if (data) {
      const text = `Check out ${title} on @HiveKenya 🐝`;
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(data.shortUrl)}`;
      await Linking.openURL(url);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>Share</Text>
          </View>

          {/* Preview */}
          <View style={styles.preview}>
            {imageUrl && (
              <View style={styles.previewImage}>
                <Icon name="image" size={24} color="#9CA3AF" />
              </View>
            )}
            <View style={styles.previewText}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {title}
              </Text>
              {businessName && (
                <Text style={styles.previewBusiness}>{businessName}</Text>
              )}
              {price && (
                <Text style={styles.previewPrice}>
                  KES {price.toLocaleString()}
                </Text>
              )}
            </View>
          </View>

          {/* Share Options */}
          <View style={styles.options}>
            <ShareOption
              icon="message-circle"
              label="WhatsApp"
              color="#25D366"
              onPress={handleWhatsApp}
              loading={isLoading}
            />
            <ShareOption
              icon="send"
              label="Telegram"
              color="#0088cc"
              onPress={handleTelegram}
              loading={isLoading}
            />
            <ShareOption
              icon="message-square"
              label="SMS"
              color="#34C759"
              onPress={handleSMS}
              loading={isLoading}
            />
            <ShareOption
              icon="twitter"
              label="Twitter"
              color="#1DA1F2"
              onPress={handleTwitter}
              loading={isLoading}
            />
          </View>

          <View style={styles.divider} />

          {/* More Options */}
          <View style={styles.moreOptions}>
            <TouchableOpacity
              style={styles.moreOption}
              onPress={handleCopyLink}
              disabled={isLoading}
            >
              <View style={styles.moreOptionIcon}>
                <Icon name="link" size={20} color="#6B7280" />
              </View>
              <Text style={styles.moreOptionText}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreOption}
              onPress={handleNativeShare}
              disabled={isLoading}
            >
              <View style={styles.moreOptionIcon}>
                <Icon name="share" size={20} color="#6B7280" />
              </View>
              <Text style={styles.moreOptionText}>More Options</Text>
            </TouchableOpacity>
          </View>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// =====================================================
// SHARE OPTION
// =====================================================
function ShareOption({
  icon,
  label,
  color,
  onPress,
  loading,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.option}
      onPress={onPress}
      disabled={loading}
    >
      <View style={[styles.optionIcon, { backgroundColor: color }]}>
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Icon name={icon} size={24} color="#fff" />
        )}
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// =====================================================
// WHATSAPP INQUIRY BUTTON
// =====================================================
export function WhatsAppInquiryButton({
  productId,
  productName,
  businessId,
  style,
}: {
  productId?: string;
  productName?: string;
  businessId: string;
  style?: any;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePress = async () => {
    setIsLoading(true);
    try {
      let url: string;

      if (productId) {
        const response = await api.get(`/whatsapp/product/${productId}/inquiry`);
        url = response.data.url;
      } else {
        const response = await api.get(`/whatsapp/business/${businessId}/url`, {
          params: { productName },
        });
        url = response.data.url;
      }

      await Linking.openURL(url);
    } catch (error) {
      console.error('Failed to get WhatsApp URL:', error);
      Toast.show({
        type: 'error',
        text1: 'Unable to open WhatsApp',
        text2: 'Please try again',
        position: 'bottom',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.whatsappButton, style]}
      onPress={handlePress}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <Icon name="message-circle" size={20} color="#fff" />
          <Text style={styles.whatsappButtonText}>WhatsApp</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// =====================================================
// STYLES
// =====================================================
const styles = StyleSheet.create({
  shareButton: {
    padding: 8,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34, // Safe area
  },
  header: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  preview: {
    flexDirection: 'row',
    padding: 16,
    marginHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    gap: 12,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewText: {
    flex: 1,
    justifyContent: 'center',
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  previewBusiness: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  previewPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
    marginTop: 4,
  },
  options: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  option: {
    alignItems: 'center',
    gap: 8,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 12,
    color: '#374151',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  moreOptions: {
    paddingVertical: 8,
  },
  moreOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 16,
  },
  moreOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreOptionText: {
    fontSize: 15,
    color: '#374151',
  },
  cancelButton: {
    paddingVertical: 16,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  whatsappButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  whatsappButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ShareSheet;
