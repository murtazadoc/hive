import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Share,
  ActivityIndicator,
} from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useReelsStore } from '../../store/reelsStore';
import { reelsApi } from '../../api/reels';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TAB_BAR_HEIGHT = 60;
const VIDEO_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT;

// =====================================================
// TYPES
// =====================================================
interface Reel {
  id: string;
  hlsUrl?: string;
  processedUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  hashtags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLiked: boolean;
  isSaved: boolean;
  business: {
    id: string;
    businessName: string;
    slug: string;
    logoUrl?: string;
  };
  taggedProductIds: string[];
}

// =====================================================
// REELS FEED SCREEN
// =====================================================
export default function ReelsFeedScreen() {
  const navigation = useNavigation<any>();
  const { reels, isLoading, fetchFeed, likeReel, unlikeReel, saveReel, unsaveReel } = useReelsStore();
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    fetchFeed();
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
  }).current;

  const handleLike = async (reel: Reel) => {
    if (reel.isLiked) {
      await unlikeReel(reel.id);
    } else {
      await likeReel(reel.id);
    }
  };

  const handleSave = async (reel: Reel) => {
    if (reel.isSaved) {
      await unsaveReel(reel.id);
    } else {
      await saveReel(reel.id);
    }
  };

  const handleShare = async (reel: Reel) => {
    try {
      await Share.share({
        message: `Check out this reel from ${reel.business.businessName}\n\nhttps://hive.co.ke/reels/${reel.id}`,
      });
      reelsApi.logShare(reel.id, 'native');
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const handleComment = (reel: Reel) => {
    navigation.navigate('ReelComments', { reelId: reel.id });
  };

  const handleBusinessPress = (reel: Reel) => {
    navigation.navigate('BusinessDetail', { businessId: reel.business.id });
  };

  const handleProductPress = (productId: string) => {
    navigation.navigate('ProductDetail', { productId });
  };

  const renderReel = ({ item, index }: { item: Reel; index: number }) => (
    <ReelItem
      reel={item}
      isActive={index === activeIndex}
      isMuted={isMuted}
      onToggleMute={() => setIsMuted(!isMuted)}
      onLike={() => handleLike(item)}
      onSave={() => handleSave(item)}
      onShare={() => handleShare(item)}
      onComment={() => handleComment(item)}
      onBusinessPress={() => handleBusinessPress(item)}
      onProductPress={handleProductPress}
    />
  );

  if (isLoading && reels.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F59E0B" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={reels}
        renderItem={renderReel}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={VIDEO_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={5}
        getItemLayout={(_, index) => ({
          length: VIDEO_HEIGHT,
          offset: VIDEO_HEIGHT * index,
          index,
        })}
      />
    </View>
  );
}

// =====================================================
// REEL ITEM COMPONENT
// =====================================================
interface ReelItemProps {
  reel: Reel;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  onComment: () => void;
  onBusinessPress: () => void;
  onProductPress: (productId: string) => void;
}

function ReelItem({
  reel,
  isActive,
  isMuted,
  onToggleMute,
  onLike,
  onSave,
  onShare,
  onComment,
  onBusinessPress,
  onProductPress,
}: ReelItemProps) {
  const videoRef = useRef<VideoRef>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const likeScale = useRef(new Animated.Value(1)).current;
  const doubleTapRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [isActive]);

  const handlePress = () => {
    if (doubleTapRef.current) {
      // Double tap - like
      clearTimeout(doubleTapRef.current);
      doubleTapRef.current = null;
      handleDoubleTap();
    } else {
      // Single tap - toggle play
      doubleTapRef.current = setTimeout(() => {
        doubleTapRef.current = null;
        setIsPlaying(!isPlaying);
      }, 300);
    }
  };

  const handleDoubleTap = () => {
    if (!reel.isLiked) {
      onLike();
      // Animate heart
      Animated.sequence([
        Animated.spring(likeScale, {
          toValue: 1.4,
          useNativeDriver: true,
        }),
        Animated.spring(likeScale, {
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const videoSource = reel.hlsUrl || reel.processedUrl;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handlePress}
      style={styles.reelContainer}
    >
      {/* Video Player */}
      {videoSource && (
        <Video
          ref={videoRef}
          source={{ uri: videoSource }}
          style={styles.video}
          resizeMode="cover"
          repeat
          paused={!isPlaying}
          muted={isMuted}
          onBuffer={({ isBuffering }) => setIsBuffering(isBuffering)}
          onError={(error) => console.error('Video error:', error)}
          poster={reel.thumbnailUrl}
          posterResizeMode="cover"
        />
      )}

      {/* Buffering Indicator */}
      {isBuffering && isActive && (
        <View style={styles.bufferingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Play/Pause Indicator */}
      {!isPlaying && isActive && (
        <View style={styles.pauseIndicator}>
          <Icon name="play" size={60} color="rgba(255,255,255,0.8)" />
        </View>
      )}

      {/* Gradient Overlay */}
      <View style={styles.gradientOverlay} />

      {/* Content */}
      <View style={styles.content}>
        {/* Left Side - Business & Caption */}
        <View style={styles.leftContent}>
          {/* Business Info */}
          <TouchableOpacity style={styles.businessInfo} onPress={onBusinessPress}>
            <View style={styles.businessLogo}>
              {reel.business.logoUrl ? (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>{reel.business.businessName[0]}</Text>
                </View>
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>{reel.business.businessName[0]}</Text>
                </View>
              )}
            </View>
            <Text style={styles.businessName}>{reel.business.businessName}</Text>
            <TouchableOpacity style={styles.followButton}>
              <Text style={styles.followText}>Follow</Text>
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Caption */}
          {reel.caption && (
            <Text style={styles.caption} numberOfLines={3}>
              {reel.caption}
            </Text>
          )}

          {/* Hashtags */}
          {reel.hashtags.length > 0 && (
            <View style={styles.hashtags}>
              {reel.hashtags.slice(0, 3).map((tag) => (
                <Text key={tag} style={styles.hashtag}>#{tag}</Text>
              ))}
            </View>
          )}

          {/* Tagged Products */}
          {reel.taggedProductIds.length > 0 && (
            <TouchableOpacity
              style={styles.productTag}
              onPress={() => onProductPress(reel.taggedProductIds[0])}
            >
              <Icon name="shopping-bag" size={14} color="#fff" />
              <Text style={styles.productTagText}>View Products</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Right Side - Actions */}
        <View style={styles.rightContent}>
          {/* Like */}
          <TouchableOpacity style={styles.actionButton} onPress={onLike}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Icon
                name="heart"
                size={28}
                color={reel.isLiked ? '#EF4444' : '#fff'}
                style={reel.isLiked ? { fill: '#EF4444' } : undefined}
              />
            </Animated.View>
            <Text style={styles.actionCount}>{formatCount(reel.likeCount)}</Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity style={styles.actionButton} onPress={onComment}>
            <Icon name="message-circle" size={28} color="#fff" />
            <Text style={styles.actionCount}>{formatCount(reel.commentCount)}</Text>
          </TouchableOpacity>

          {/* Save */}
          <TouchableOpacity style={styles.actionButton} onPress={onSave}>
            <Icon
              name="bookmark"
              size={28}
              color={reel.isSaved ? '#F59E0B' : '#fff'}
            />
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity style={styles.actionButton} onPress={onShare}>
            <Icon name="send" size={26} color="#fff" />
            <Text style={styles.actionCount}>{formatCount(reel.shareCount)}</Text>
          </TouchableOpacity>

          {/* Mute Toggle */}
          <TouchableOpacity style={styles.actionButton} onPress={onToggleMute}>
            <Icon name={isMuted ? 'volume-x' : 'volume-2'} size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// =====================================================
// HELPERS
// =====================================================
function formatCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K';
  }
  return count.toString();
}

// =====================================================
// STYLES
// =====================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  reelContainer: {
    width: SCREEN_WIDTH,
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bufferingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseIndicator: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
  },
  content: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  leftContent: {
    flex: 1,
    marginRight: 60,
  },
  rightContent: {
    alignItems: 'center',
    gap: 20,
  },
  businessInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  businessLogo: {
    marginRight: 10,
  },
  logoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  logoText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  businessName: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    flex: 1,
  },
  followButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },
  followText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  caption: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  hashtags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  hashtag: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  productTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
    gap: 6,
  },
  productTagText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  actionButton: {
    alignItems: 'center',
  },
  actionCount: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
});
