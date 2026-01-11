-- =====================================================
-- HIVE DATABASE SCHEMA - SESSION 10
-- Notifications & Messaging System
-- =====================================================

-- =====================================================
-- DEVICE TOKENS (Push Notifications)
-- =====================================================
CREATE TABLE device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Token info
    token TEXT NOT NULL,
    platform VARCHAR(20) NOT NULL,         -- ios, android, web
    
    -- Device info
    device_id VARCHAR(100),
    device_name VARCHAR(100),
    app_version VARCHAR(20),
    os_version VARCHAR(20),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_user_token UNIQUE (user_id, token)
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Recipient
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Content
    type VARCHAR(50) NOT NULL,             -- order_update, new_message, promotion, etc.
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT,
    
    -- Action
    action_type VARCHAR(30),               -- open_order, open_product, open_url, etc.
    action_data JSONB DEFAULT '{}',        -- { orderId: 'xxx' } or { url: 'xxx' }
    
    -- Delivery
    channels TEXT[] DEFAULT '{}',          -- ['push', 'sms', 'email', 'in_app']
    
    -- Status
    read_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    
    -- Push delivery
    push_sent BOOLEAN DEFAULT false,
    push_sent_at TIMESTAMPTZ,
    push_error TEXT,
    
    -- SMS delivery
    sms_sent BOOLEAN DEFAULT false,
    sms_sent_at TIMESTAMPTZ,
    sms_message_id VARCHAR(100),
    
    -- Grouping
    group_key VARCHAR(100),                -- For collapsing similar notifications
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ                 -- Auto-delete after this
);

-- =====================================================
-- NOTIFICATION PREFERENCES
-- =====================================================
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Channel preferences
    push_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT true,
    in_app_enabled BOOLEAN DEFAULT true,
    
    -- Type preferences
    order_updates BOOLEAN DEFAULT true,
    promotions BOOLEAN DEFAULT true,
    new_products BOOLEAN DEFAULT true,
    price_drops BOOLEAN DEFAULT true,
    messages BOOLEAN DEFAULT true,
    follows BOOLEAN DEFAULT true,
    
    -- Quiet hours
    quiet_hours_enabled BOOLEAN DEFAULT false,
    quiet_hours_start TIME,                -- e.g., 22:00
    quiet_hours_end TIME,                  -- e.g., 07:00
    
    -- Frequency
    promotion_frequency VARCHAR(20) DEFAULT 'normal', -- none, low, normal, high
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_user_preferences UNIQUE (user_id)
);

-- =====================================================
-- NOTIFICATION TEMPLATES
-- =====================================================
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Template info
    code VARCHAR(50) NOT NULL UNIQUE,      -- order_confirmed, order_shipped, etc.
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    
    -- Content
    title_template VARCHAR(255) NOT NULL,  -- "Order {{order_number}} confirmed"
    body_template TEXT NOT NULL,
    
    -- SMS (shorter)
    sms_template TEXT,
    
    -- Push specific
    push_image_url TEXT,
    push_action_type VARCHAR(30),
    
    -- Variables
    variables TEXT[] DEFAULT '{}',         -- ['order_number', 'business_name', 'amount']
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SMS MESSAGES
-- =====================================================
CREATE TABLE sms_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Recipient
    phone_number VARCHAR(20) NOT NULL,
    user_id UUID REFERENCES users(id),
    
    -- Content
    message TEXT NOT NULL,
    
    -- Provider
    provider VARCHAR(30) NOT NULL,         -- africastalking, twilio, etc.
    provider_message_id VARCHAR(100),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- pending, sent, delivered, failed
    status_updated_at TIMESTAMPTZ,
    error_message TEXT,
    
    -- Cost
    cost DECIMAL(8, 4),
    currency VARCHAR(3) DEFAULT 'KES',
    
    -- Related
    notification_id UUID REFERENCES notifications(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PUSH NOTIFICATION LOG
-- =====================================================
CREATE TABLE push_notifications_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Target
    user_id UUID REFERENCES users(id),
    device_token_id UUID REFERENCES device_tokens(id),
    
    -- Content
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    
    -- Provider
    provider VARCHAR(30) NOT NULL,         -- fcm, apns, expo
    provider_message_id VARCHAR(100),
    
    -- Status
    status VARCHAR(20) DEFAULT 'sent',     -- sent, delivered, failed, clicked
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Related
    notification_id UUID REFERENCES notifications(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- BROADCAST CAMPAIGNS
-- =====================================================
CREATE TABLE broadcast_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Campaign info
    name VARCHAR(100) NOT NULL,
    type VARCHAR(30) NOT NULL,             -- promotion, announcement, reminder
    
    -- Content
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT,
    action_type VARCHAR(30),
    action_data JSONB,
    
    -- Targeting
    target_type VARCHAR(30) DEFAULT 'all', -- all, segment, specific
    target_segment JSONB,                  -- { "has_ordered": true, "county": "Nairobi" }
    target_user_ids UUID[],
    
    -- Channels
    channels TEXT[] DEFAULT ARRAY['push', 'in_app'],
    
    -- Schedule
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Stats
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft',    -- draft, scheduled, sending, completed, cancelled
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id, is_active);
CREATE INDEX idx_device_tokens_platform ON device_tokens(platform, is_active);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_type ON notifications(type, created_at DESC);

CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id);

CREATE INDEX idx_sms_messages_phone ON sms_messages(phone_number);
CREATE INDEX idx_sms_messages_status ON sms_messages(status);

CREATE INDEX idx_push_log_user ON push_notifications_log(user_id, created_at DESC);
CREATE INDEX idx_push_log_notification ON push_notifications_log(notification_id);

CREATE INDEX idx_broadcast_status ON broadcast_campaigns(status, scheduled_at);

-- =====================================================
-- INSERT DEFAULT TEMPLATES
-- =====================================================
INSERT INTO notification_templates (code, name, type, title_template, body_template, sms_template, variables) VALUES
('order_confirmed', 'Order Confirmed', 'order_update', 
 'Order Confirmed! 🎉', 
 'Your order #{{order_number}} from {{business_name}} has been confirmed. Total: KES {{amount}}',
 'HIVE: Order #{{order_number}} confirmed. Total KES {{amount}}. Track at hive.co.ke/orders',
 ARRAY['order_number', 'business_name', 'amount']),

('order_shipped', 'Order Shipped', 'order_update',
 'Your order is on the way! 🚚',
 'Order #{{order_number}} from {{business_name}} has been shipped and will arrive soon.',
 'HIVE: Order #{{order_number}} shipped! Arriving soon.',
 ARRAY['order_number', 'business_name']),

('order_delivered', 'Order Delivered', 'order_update',
 'Order Delivered! ✅',
 'Your order #{{order_number}} from {{business_name}} has been delivered. Enjoy!',
 'HIVE: Order #{{order_number}} delivered. Thank you for shopping!',
 ARRAY['order_number', 'business_name']),

('payment_received', 'Payment Received', 'payment',
 'Payment Successful 💰',
 'We received your payment of KES {{amount}} for order #{{order_number}}. Thank you!',
 'HIVE: Payment of KES {{amount}} received for order #{{order_number}}.',
 ARRAY['amount', 'order_number']),

('new_follower', 'New Follower', 'social',
 'New follower! 👋',
 '{{follower_name}} started following your business {{business_name}}.',
 NULL,
 ARRAY['follower_name', 'business_name']),

('price_drop', 'Price Drop', 'promotion',
 'Price Drop Alert! 🔥',
 '{{product_name}} is now KES {{new_price}} (was KES {{old_price}}). Don''t miss out!',
 'HIVE: {{product_name}} now KES {{new_price}}! Shop at hive.co.ke',
 ARRAY['product_name', 'new_price', 'old_price']),

('new_message', 'New Message', 'message',
 'New message from {{sender_name}}',
 '{{message_preview}}',
 NULL,
 ARRAY['sender_name', 'message_preview']);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Get unread notification count
CREATE OR REPLACE FUNCTION get_unread_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM notifications
        WHERE user_id = p_user_id AND read_at IS NULL
    );
END;
$$ LANGUAGE plpgsql;

-- Mark all as read
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE notifications
    SET read_at = NOW()
    WHERE user_id = p_user_id AND read_at IS NULL;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER update_device_tokens_timestamp
    BEFORE UPDATE ON device_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_timestamp
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_timestamp
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_broadcast_campaigns_timestamp
    BEFORE UPDATE ON broadcast_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
