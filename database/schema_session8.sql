-- =====================================================
-- HIVE DATABASE SCHEMA - SESSION 8
-- WhatsApp Integration
-- =====================================================

-- =====================================================
-- WHATSAPP BUSINESS SETTINGS
-- =====================================================
CREATE TABLE whatsapp_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    
    -- WhatsApp number
    phone_number VARCHAR(20) NOT NULL,
    country_code VARCHAR(5) DEFAULT '+254',
    
    -- Business API (optional)
    waba_id VARCHAR(50),                  -- WhatsApp Business Account ID
    phone_number_id VARCHAR(50),          -- Phone Number ID from Meta
    access_token_encrypted TEXT,          -- Encrypted access token
    
    -- Settings
    is_verified BOOLEAN DEFAULT false,
    auto_reply_enabled BOOLEAN DEFAULT true,
    catalog_sync_enabled BOOLEAN DEFAULT false,
    
    -- Working hours
    working_hours JSONB DEFAULT '{
      "monday": {"start": "08:00", "end": "18:00", "enabled": true},
      "tuesday": {"start": "08:00", "end": "18:00", "enabled": true},
      "wednesday": {"start": "08:00", "end": "18:00", "enabled": true},
      "thursday": {"start": "08:00", "end": "18:00", "enabled": true},
      "friday": {"start": "08:00", "end": "18:00", "enabled": true},
      "saturday": {"start": "09:00", "end": "14:00", "enabled": true},
      "sunday": {"start": null, "end": null, "enabled": false}
    }',
    
    -- Auto-reply messages
    greeting_message TEXT DEFAULT 'Hello! Thanks for contacting us. How can we help you today?',
    away_message TEXT DEFAULT 'Thanks for your message! We''re currently away but will respond as soon as we''re back.',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_business_whatsapp UNIQUE (business_id)
);

-- =====================================================
-- WHATSAPP MESSAGE TEMPLATES
-- =====================================================
CREATE TABLE whatsapp_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    
    -- Template info
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,        -- order_update, shipping, promotion, etc.
    language VARCHAR(10) DEFAULT 'en',
    
    -- Content
    header_type VARCHAR(20),              -- text, image, document, video
    header_content TEXT,
    body_text TEXT NOT NULL,
    footer_text TEXT,
    
    -- Buttons
    buttons JSONB DEFAULT '[]',           -- [{"type": "url", "text": "View", "url": "..."}]
    
    -- Variables
    variables JSONB DEFAULT '[]',         -- ["customer_name", "order_id", "amount"]
    
    -- Meta approval (for Business API)
    meta_template_id VARCHAR(50),
    approval_status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
    rejection_reason TEXT,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- WHATSAPP CONVERSATIONS
-- =====================================================
CREATE TABLE whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    
    -- Customer
    customer_phone VARCHAR(20) NOT NULL,
    customer_name VARCHAR(100),
    customer_user_id UUID REFERENCES users(id),
    
    -- Conversation state
    status VARCHAR(20) DEFAULT 'active',  -- active, resolved, archived
    assigned_to UUID REFERENCES users(id),
    
    -- Context
    source VARCHAR(30),                   -- product_inquiry, order_support, general
    context_type VARCHAR(30),             -- product, order, business
    context_id UUID,
    
    -- Stats
    message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,
    
    -- Customer window (24-hour rule)
    window_expires_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_business_customer UNIQUE (business_id, customer_phone)
);

-- =====================================================
-- WHATSAPP MESSAGES
-- =====================================================
CREATE TABLE whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    
    -- Message info
    wa_message_id VARCHAR(100),           -- WhatsApp message ID
    direction VARCHAR(10) NOT NULL,       -- inbound, outbound
    
    -- Content
    message_type VARCHAR(20) NOT NULL,    -- text, image, document, audio, video, template, interactive
    content TEXT,
    media_url TEXT,
    media_mime_type VARCHAR(50),
    
    -- Template (if applicable)
    template_id UUID REFERENCES whatsapp_templates(id),
    template_variables JSONB,
    
    -- Interactive (buttons, lists)
    interactive_type VARCHAR(20),         -- button, list, product
    interactive_data JSONB,
    
    -- Delivery status
    status VARCHAR(20) DEFAULT 'sent',    -- sent, delivered, read, failed
    error_message TEXT,
    
    -- Metadata
    sent_by UUID REFERENCES users(id),    -- Staff who sent (for outbound)
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ
);

-- =====================================================
-- SHARE LINKS (for deep linking)
-- =====================================================
CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Short code
    code VARCHAR(20) NOT NULL UNIQUE,
    
    -- Target
    target_type VARCHAR(30) NOT NULL,     -- product, business, reel, collection
    target_id UUID NOT NULL,
    
    -- Creator
    created_by UUID REFERENCES users(id),
    business_id UUID REFERENCES business_profiles(id),
    
    -- Tracking
    click_count INTEGER DEFAULT 0,
    whatsapp_shares INTEGER DEFAULT 0,
    
    -- UTM params
    utm_source VARCHAR(50),
    utm_medium VARCHAR(50),
    utm_campaign VARCHAR(100),
    
    -- Expiry
    expires_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SHARE ANALYTICS
-- =====================================================
CREATE TABLE share_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
    
    -- Click info
    clicked_at TIMESTAMPTZ DEFAULT NOW(),
    referrer VARCHAR(50),                 -- whatsapp, telegram, sms, copy
    
    -- User info
    user_id UUID REFERENCES users(id),
    session_id VARCHAR(100),
    
    -- Device
    device_type VARCHAR(20),
    platform VARCHAR(20),
    country VARCHAR(5),
    
    -- Conversion
    converted BOOLEAN DEFAULT false,
    conversion_type VARCHAR(30),          -- view, add_to_cart, purchase, follow
    conversion_at TIMESTAMPTZ
);

-- =====================================================
-- WHATSAPP CATALOG SYNC
-- =====================================================
CREATE TABLE whatsapp_catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Meta catalog IDs
    catalog_id VARCHAR(50),
    retailer_id VARCHAR(100),
    
    -- Sync status
    sync_status VARCHAR(20) DEFAULT 'pending', -- pending, synced, failed, removed
    last_synced_at TIMESTAMPTZ,
    sync_error TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_product_catalog UNIQUE (business_id, product_id)
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_whatsapp_settings_business ON whatsapp_settings(business_id);
CREATE INDEX idx_whatsapp_templates_business ON whatsapp_templates(business_id);
CREATE INDEX idx_whatsapp_conversations_business ON whatsapp_conversations(business_id);
CREATE INDEX idx_whatsapp_conversations_customer ON whatsapp_conversations(customer_phone);
CREATE INDEX idx_whatsapp_conversations_status ON whatsapp_conversations(status, last_message_at DESC);
CREATE INDEX idx_whatsapp_messages_conversation ON whatsapp_messages(conversation_id, created_at DESC);
CREATE INDEX idx_share_links_code ON share_links(code);
CREATE INDEX idx_share_links_target ON share_links(target_type, target_id);
CREATE INDEX idx_share_clicks_link ON share_clicks(share_link_id, clicked_at DESC);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Generate short code for share links
CREATE OR REPLACE FUNCTION generate_share_code()
RETURNS VARCHAR(10) AS $$
DECLARE
    chars VARCHAR(62) := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR(10) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * 62 + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Check if within WhatsApp 24-hour window
CREATE OR REPLACE FUNCTION is_within_whatsapp_window(conv_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM whatsapp_conversations
        WHERE id = conv_id
        AND window_expires_at > NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER update_whatsapp_settings_timestamp
    BEFORE UPDATE ON whatsapp_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_templates_timestamp
    BEFORE UPDATE ON whatsapp_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_conversations_timestamp
    BEFORE UPDATE ON whatsapp_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update conversation stats on new message
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE whatsapp_conversations
    SET 
        message_count = message_count + 1,
        last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.content, 100),
        window_expires_at = CASE 
            WHEN NEW.direction = 'inbound' THEN NEW.created_at + INTERVAL '24 hours'
            ELSE window_expires_at
        END
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_conversation_stats
    AFTER INSERT ON whatsapp_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_stats();
