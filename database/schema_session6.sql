-- =====================================================
-- HIVE DATABASE SCHEMA - SESSION 6
-- Video Reels & HLS Streaming
-- =====================================================

-- =====================================================
-- REELS / SHORT VIDEOS
-- =====================================================
CREATE TABLE reels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    
    -- Content
    caption TEXT,
    hashtags TEXT[] DEFAULT '{}',
    
    -- Video files
    original_url TEXT NOT NULL,           -- Original uploaded video
    processed_url TEXT,                   -- Transcoded MP4
    hls_url TEXT,                         -- HLS manifest (.m3u8)
    thumbnail_url TEXT,                   -- Video thumbnail
    
    -- Video metadata
    duration_seconds INTEGER,             -- Video length in seconds
    width INTEGER,
    height INTEGER,
    aspect_ratio VARCHAR(10),             -- '9:16', '16:9', '1:1'
    file_size_bytes BIGINT,
    
    -- Processing status
    processing_status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    processing_error TEXT,
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    
    -- Product tagging
    tagged_product_ids UUID[] DEFAULT '{}',
    
    -- Audio
    has_audio BOOLEAN DEFAULT true,
    music_track_id UUID REFERENCES music_tracks(id),
    original_audio BOOLEAN DEFAULT true,
    
    -- Visibility
    visibility VARCHAR(20) DEFAULT 'public', -- public, followers, private
    is_featured BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    
    -- Moderation
    moderation_status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, flagged
    moderation_notes TEXT,
    moderated_by UUID REFERENCES users(id),
    moderated_at TIMESTAMPTZ,
    
    -- Stats (denormalized for performance)
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    save_count INTEGER DEFAULT 0,
    
    -- Timestamps
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- MUSIC TRACKS (for adding to reels)
-- =====================================================
CREATE TABLE music_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Track info
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255),
    album VARCHAR(255),
    
    -- Audio files
    audio_url TEXT NOT NULL,
    preview_url TEXT,                     -- 30-second preview
    
    -- Metadata
    duration_seconds INTEGER,
    bpm INTEGER,
    genre VARCHAR(50),
    
    -- Licensing
    is_licensed BOOLEAN DEFAULT true,
    license_type VARCHAR(50),             -- royalty_free, licensed, original
    attribution_required BOOLEAN DEFAULT false,
    
    -- Stats
    use_count INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- REEL INTERACTIONS
-- =====================================================
CREATE TABLE reel_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_reel_like UNIQUE (reel_id, user_id)
);

CREATE TABLE reel_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES reel_comments(id) ON DELETE CASCADE,
    
    content TEXT NOT NULL,
    
    -- Mentions
    mentioned_user_ids UUID[] DEFAULT '{}',
    
    -- Moderation
    is_hidden BOOLEAN DEFAULT false,
    hidden_reason TEXT,
    
    -- Stats
    like_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE reel_saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Collection/folder
    collection_name VARCHAR(100),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_reel_save UNIQUE (reel_id, user_id)
);

CREATE TABLE reel_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    share_type VARCHAR(20) NOT NULL,      -- whatsapp, copy_link, instagram, twitter
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- REEL VIEWS (for analytics)
-- =====================================================
CREATE TABLE reel_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100),
    
    -- View details
    watch_duration_seconds INTEGER,       -- How long they watched
    watch_percentage DECIMAL(5, 2),       -- % of video watched
    completed BOOLEAN DEFAULT false,      -- Watched to end
    
    -- Source
    source VARCHAR(50),                   -- feed, profile, search, share
    
    -- Device info
    device_type VARCHAR(20),              -- mobile, tablet, desktop
    platform VARCHAR(20),                 -- ios, android, web
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- USER REEL PREFERENCES (for feed algorithm)
-- =====================================================
CREATE TABLE user_reel_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Category preferences (weighted scores)
    category_scores JSONB DEFAULT '{}',   -- { "category_id": score }
    
    -- Business preferences
    followed_business_ids UUID[] DEFAULT '{}',
    muted_business_ids UUID[] DEFAULT '{}',
    
    -- Content preferences
    preferred_duration VARCHAR(20),       -- short (<15s), medium (15-30s), long (30-60s)
    
    -- Last updated
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_user_reel_prefs UNIQUE (user_id)
);

-- =====================================================
-- REEL FEED CACHE (pre-computed personalized feeds)
-- =====================================================
CREATE TABLE reel_feed_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Cached reel IDs in order
    reel_ids UUID[] NOT NULL,
    
    -- Cache metadata
    algorithm_version VARCHAR(20) DEFAULT 'v1',
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    CONSTRAINT unique_user_feed_cache UNIQUE (user_id)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Reels
CREATE INDEX idx_reels_business ON reels(business_id);
CREATE INDEX idx_reels_status ON reels(processing_status, moderation_status);
CREATE INDEX idx_reels_published ON reels(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX idx_reels_trending ON reels(view_count DESC, published_at DESC);
CREATE INDEX idx_reels_featured ON reels(is_featured, published_at DESC) WHERE is_featured = true;
CREATE INDEX idx_reels_hashtags ON reels USING GIN(hashtags);
CREATE INDEX idx_reels_products ON reels USING GIN(tagged_product_ids);

-- Interactions
CREATE INDEX idx_reel_likes_reel ON reel_likes(reel_id);
CREATE INDEX idx_reel_likes_user ON reel_likes(user_id);
CREATE INDEX idx_reel_comments_reel ON reel_comments(reel_id, created_at DESC);
CREATE INDEX idx_reel_comments_user ON reel_comments(user_id);
CREATE INDEX idx_reel_saves_user ON reel_saves(user_id);

-- Views
CREATE INDEX idx_reel_views_reel ON reel_views(reel_id, created_at DESC);
CREATE INDEX idx_reel_views_user ON reel_views(user_id, created_at DESC);

-- Feed cache
CREATE INDEX idx_reel_feed_cache_expires ON reel_feed_cache(expires_at);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Increment view count
CREATE OR REPLACE FUNCTION increment_reel_views(reel_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE reels SET view_count = view_count + 1 WHERE id = reel_uuid;
END;
$$ LANGUAGE plpgsql;

-- Get trending reels
CREATE OR REPLACE FUNCTION get_trending_reels(
    time_window INTERVAL DEFAULT '24 hours',
    result_limit INT DEFAULT 50
)
RETURNS TABLE (
    reel_id UUID,
    score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as reel_id,
        (
            COALESCE(rv.recent_views, 0) * 1.0 +
            r.like_count * 2.0 +
            r.comment_count * 3.0 +
            r.share_count * 4.0
        ) / EXTRACT(EPOCH FROM (NOW() - r.published_at)) * 3600 as score
    FROM reels r
    LEFT JOIN (
        SELECT reel_id, COUNT(*) as recent_views
        FROM reel_views
        WHERE created_at > NOW() - time_window
        GROUP BY reel_id
    ) rv ON r.id = rv.reel_id
    WHERE r.processing_status = 'completed'
        AND r.moderation_status = 'approved'
        AND r.visibility = 'public'
        AND r.published_at > NOW() - INTERVAL '7 days'
    ORDER BY score DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update timestamps
CREATE TRIGGER update_reels_timestamp
    BEFORE UPDATE ON reels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reel_comments_timestamp
    BEFORE UPDATE ON reel_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update like count on reels
CREATE OR REPLACE FUNCTION update_reel_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE reels SET like_count = like_count + 1 WHERE id = NEW.reel_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE reels SET like_count = like_count - 1 WHERE id = OLD.reel_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reel_like_count
    AFTER INSERT OR DELETE ON reel_likes
    FOR EACH ROW
    EXECUTE FUNCTION update_reel_like_count();

-- Update comment count on reels
CREATE OR REPLACE FUNCTION update_reel_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE reels SET comment_count = comment_count + 1 WHERE id = NEW.reel_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE reels SET comment_count = comment_count - 1 WHERE id = OLD.reel_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reel_comment_count
    AFTER INSERT OR DELETE ON reel_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_reel_comment_count();
