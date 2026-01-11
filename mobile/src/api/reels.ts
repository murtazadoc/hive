/**
 * HIVE Reels API Client
 */

import api from './client';

// =====================================================
// TYPES
// =====================================================
export interface Reel {
  id: string;
  businessId: string;
  caption?: string;
  hashtags: string[];
  originalUrl: string;
  processedUrl?: string;
  hlsUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  aspectRatio?: string;
  processingStatus: string;
  visibility: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  isLiked: boolean;
  isSaved: boolean;
  taggedProductIds: string[];
  business: {
    id: string;
    businessName: string;
    slug: string;
    logoUrl?: string;
  };
  publishedAt?: string;
  createdAt: string;
}

export interface ReelComment {
  id: string;
  content: string;
  likeCount: number;
  replyCount: number;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

export interface UploadReelDto {
  businessId: string;
  caption?: string;
  hashtags?: string[];
  taggedProductIds?: string[];
  visibility?: 'public' | 'followers' | 'private';
}

// =====================================================
// REELS API
// =====================================================
export const reelsApi = {
  // Feed
  getFeed: async (cursor?: string, limit: number = 10): Promise<Reel[]> => {
    const response = await api.get('/reels/feed', {
      params: { cursor, limit },
    });
    return response.data;
  },

  getTrending: async (limit: number = 20): Promise<Reel[]> => {
    const response = await api.get('/reels/trending', {
      params: { limit },
    });
    return response.data;
  },

  getBusinessReels: async (
    businessId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<Reel[]> => {
    const response = await api.get(`/reels/business/${businessId}`, {
      params: { cursor, limit },
    });
    return response.data;
  },

  // Single reel
  getReel: async (id: string): Promise<Reel> => {
    const response = await api.get(`/reels/${id}`);
    return response.data;
  },

  // Upload
  uploadReel: async (
    videoUri: string,
    dto: UploadReelDto,
    onProgress?: (percent: number) => void,
  ): Promise<{ reelId: string; status: string }> => {
    const formData = new FormData();
    formData.append('video', {
      uri: videoUri,
      type: 'video/mp4',
      name: 'reel.mp4',
    } as any);
    formData.append('businessId', dto.businessId);
    if (dto.caption) formData.append('caption', dto.caption);
    if (dto.hashtags) formData.append('hashtags', JSON.stringify(dto.hashtags));
    if (dto.taggedProductIds) formData.append('taggedProductIds', JSON.stringify(dto.taggedProductIds));
    if (dto.visibility) formData.append('visibility', dto.visibility);

    const response = await api.post('/reels/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
        }
      },
    });

    return response.data;
  },

  // Interactions
  likeReel: async (id: string): Promise<void> => {
    await api.post(`/reels/${id}/like`);
  },

  unlikeReel: async (id: string): Promise<void> => {
    await api.delete(`/reels/${id}/like`);
  },

  saveReel: async (id: string, collection?: string): Promise<void> => {
    await api.post(`/reels/${id}/save`, { collection });
  },

  unsaveReel: async (id: string): Promise<void> => {
    await api.delete(`/reels/${id}/save`);
  },

  // Views & shares
  logView: async (
    id: string,
    sessionId: string,
    watchDuration: number,
    source: string,
  ): Promise<void> => {
    await api.post(`/reels/${id}/view`, {
      sessionId,
      watchDuration,
      source,
    });
  },

  logShare: async (id: string, shareType: string): Promise<void> => {
    await api.post(`/reels/${id}/share`, { shareType });
  },

  // Comments
  getComments: async (
    reelId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<ReelComment[]> => {
    const response = await api.get(`/reels/${reelId}/comments`, {
      params: { cursor, limit },
    });
    return response.data;
  },

  addComment: async (
    reelId: string,
    content: string,
    parentId?: string,
  ): Promise<ReelComment> => {
    const response = await api.post(`/reels/${reelId}/comments`, {
      content,
      parentId,
    });
    return response.data;
  },

  // Delete
  deleteReel: async (id: string): Promise<void> => {
    await api.delete(`/reels/${id}`);
  },
};
