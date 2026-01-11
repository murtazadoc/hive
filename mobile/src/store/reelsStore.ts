import { create } from 'zustand';
import { reelsApi, Reel } from '../api/reels';

interface ReelsState {
  // Feed
  reels: Reel[];
  isLoading: boolean;
  error: string | null;
  cursor: string | null;
  hasMore: boolean;

  // Current reel
  currentReel: Reel | null;

  // Upload
  uploadProgress: number;
  isUploading: boolean;

  // Actions
  fetchFeed: () => Promise<void>;
  fetchMore: () => Promise<void>;
  fetchTrending: () => Promise<void>;
  fetchBusinessReels: (businessId: string) => Promise<void>;
  getReel: (id: string) => Promise<void>;
  
  // Interactions
  likeReel: (id: string) => Promise<void>;
  unlikeReel: (id: string) => Promise<void>;
  saveReel: (id: string) => Promise<void>;
  unsaveReel: (id: string) => Promise<void>;
  
  // Upload
  uploadReel: (
    videoUri: string,
    businessId: string,
    caption?: string,
    hashtags?: string[],
    productIds?: string[],
  ) => Promise<string | null>;

  // Local updates
  updateReelLocally: (id: string, updates: Partial<Reel>) => void;
  clearReels: () => void;
}

export const useReelsStore = create<ReelsState>((set, get) => ({
  reels: [],
  isLoading: false,
  error: null,
  cursor: null,
  hasMore: true,
  currentReel: null,
  uploadProgress: 0,
  isUploading: false,

  // =====================================================
  // FETCH
  // =====================================================
  fetchFeed: async () => {
    set({ isLoading: true, error: null });

    try {
      const reels = await reelsApi.getFeed(undefined, 10);
      set({
        reels,
        isLoading: false,
        cursor: reels.length > 0 ? reels[reels.length - 1].id : null,
        hasMore: reels.length === 10,
      });
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.response?.data?.message || 'Failed to load reels',
      });
    }
  },

  fetchMore: async () => {
    const { cursor, hasMore, isLoading } = get();
    if (!hasMore || isLoading || !cursor) return;

    set({ isLoading: true });

    try {
      const newReels = await reelsApi.getFeed(cursor, 10);
      set((state) => ({
        reels: [...state.reels, ...newReels],
        isLoading: false,
        cursor: newReels.length > 0 ? newReels[newReels.length - 1].id : null,
        hasMore: newReels.length === 10,
      }));
    } catch (error: any) {
      set({ isLoading: false });
    }
  },

  fetchTrending: async () => {
    set({ isLoading: true, error: null });

    try {
      const reels = await reelsApi.getTrending(20);
      set({ reels, isLoading: false });
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.response?.data?.message || 'Failed to load trending',
      });
    }
  },

  fetchBusinessReels: async (businessId: string) => {
    set({ isLoading: true, error: null });

    try {
      const reels = await reelsApi.getBusinessReels(businessId);
      set({ reels, isLoading: false });
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.response?.data?.message || 'Failed to load reels',
      });
    }
  },

  getReel: async (id: string) => {
    try {
      const reel = await reelsApi.getReel(id);
      set({ currentReel: reel });
    } catch (error) {
      console.error('Failed to get reel:', error);
    }
  },

  // =====================================================
  // INTERACTIONS
  // =====================================================
  likeReel: async (id: string) => {
    // Optimistic update
    get().updateReelLocally(id, {
      isLiked: true,
      likeCount: (get().reels.find((r) => r.id === id)?.likeCount || 0) + 1,
    });

    try {
      await reelsApi.likeReel(id);
    } catch (error) {
      // Revert on error
      get().updateReelLocally(id, {
        isLiked: false,
        likeCount: (get().reels.find((r) => r.id === id)?.likeCount || 1) - 1,
      });
    }
  },

  unlikeReel: async (id: string) => {
    get().updateReelLocally(id, {
      isLiked: false,
      likeCount: Math.max(0, (get().reels.find((r) => r.id === id)?.likeCount || 1) - 1),
    });

    try {
      await reelsApi.unlikeReel(id);
    } catch (error) {
      get().updateReelLocally(id, {
        isLiked: true,
        likeCount: (get().reels.find((r) => r.id === id)?.likeCount || 0) + 1,
      });
    }
  },

  saveReel: async (id: string) => {
    get().updateReelLocally(id, { isSaved: true });

    try {
      await reelsApi.saveReel(id);
    } catch (error) {
      get().updateReelLocally(id, { isSaved: false });
    }
  },

  unsaveReel: async (id: string) => {
    get().updateReelLocally(id, { isSaved: false });

    try {
      await reelsApi.unsaveReel(id);
    } catch (error) {
      get().updateReelLocally(id, { isSaved: true });
    }
  },

  // =====================================================
  // UPLOAD
  // =====================================================
  uploadReel: async (
    videoUri: string,
    businessId: string,
    caption?: string,
    hashtags?: string[],
    productIds?: string[],
  ) => {
    set({ isUploading: true, uploadProgress: 0 });

    try {
      const result = await reelsApi.uploadReel(
        videoUri,
        {
          businessId,
          caption,
          hashtags,
          taggedProductIds: productIds,
        },
        (percent) => set({ uploadProgress: percent }),
      );

      set({ isUploading: false, uploadProgress: 100 });
      return result.reelId;
    } catch (error: any) {
      set({
        isUploading: false,
        error: error.response?.data?.message || 'Upload failed',
      });
      return null;
    }
  },

  // =====================================================
  // LOCAL UPDATES
  // =====================================================
  updateReelLocally: (id: string, updates: Partial<Reel>) => {
    set((state) => ({
      reels: state.reels.map((reel) =>
        reel.id === id ? { ...reel, ...updates } : reel,
      ),
      currentReel:
        state.currentReel?.id === id
          ? { ...state.currentReel, ...updates }
          : state.currentReel,
    }));
  },

  clearReels: () => {
    set({ reels: [], cursor: null, hasMore: true });
  },
}));
