-- Dynamic Location-Aware Advertising Platform Schema
-- PostgreSQL Database: dynamic_ads

-- ============================================
-- 1. Users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'admin',
    avatar VARCHAR(500),
    reset_token VARCHAR(255),
    reset_token_expiry TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;

-- ============================================
-- 2. Trucks
-- ============================================
CREATE TABLE IF NOT EXISTS trucks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    plate_number VARCHAR(50) UNIQUE,
    driver_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    billboard_size VARCHAR(50),
    route_name VARCHAR(255),
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 3. GPS Locations
-- ============================================
CREATE TABLE IF NOT EXISTS gps_locations (
    id SERIAL PRIMARY KEY,
    truck_id INT REFERENCES trucks(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    speed DECIMAL,
    heading DECIMAL,
    recorded_at TIMESTAMP DEFAULT NOW(),
    neighborhood VARCHAR(255),
    city VARCHAR(255),
    state VARCHAR(100)
);

-- ============================================
-- 4. Neighborhoods
-- ============================================
CREATE TABLE IF NOT EXISTS neighborhoods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(255),
    state VARCHAR(100),
    zipcode VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    population INT,
    median_age DECIMAL,
    median_income INT,
    description TEXT,
    top_interests TEXT[],
    demographic_tags TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 5. Campaigns
-- ============================================
CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255),
    budget DECIMAL,
    start_date DATE,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'draft')),
    target_demographics TEXT[],
    target_neighborhoods TEXT[],
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 6. Headlines
-- ============================================
CREATE TABLE IF NOT EXISTS headlines (
    id SERIAL PRIMARY KEY,
    campaign_id INT REFERENCES campaigns(id) ON DELETE SET NULL,
    truck_id INT REFERENCES trucks(id) ON DELETE SET NULL,
    neighborhood_id INT REFERENCES neighborhoods(id) ON DELETE SET NULL,
    headline_text TEXT NOT NULL,
    ai_prompt TEXT,
    ai_response JSONB,
    style VARCHAR(100),
    tone VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    impressions INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 7. Billboard Displays
-- ============================================
CREATE TABLE IF NOT EXISTS billboard_displays (
    id SERIAL PRIMARY KEY,
    truck_id INT REFERENCES trucks(id) ON DELETE SET NULL,
    headline_id INT REFERENCES headlines(id) ON DELETE SET NULL,
    neighborhood VARCHAR(255),
    displayed_at TIMESTAMP DEFAULT NOW(),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    duration_seconds INT,
    status VARCHAR(50) DEFAULT 'displayed'
);

-- ============================================
-- 8. Analytics
-- ============================================
CREATE TABLE IF NOT EXISTS analytics (
    id SERIAL PRIMARY KEY,
    campaign_id INT REFERENCES campaigns(id) ON DELETE SET NULL,
    truck_id INT REFERENCES trucks(id) ON DELETE SET NULL,
    date DATE,
    impressions INT DEFAULT 0,
    neighborhoods_covered INT DEFAULT 0,
    miles_driven DECIMAL DEFAULT 0,
    headlines_generated INT DEFAULT 0,
    engagement_score DECIMAL DEFAULT 0
);

-- ============================================
-- 9. Demographic Data
-- ============================================
CREATE TABLE IF NOT EXISTS demographic_data (
    id SERIAL PRIMARY KEY,
    neighborhood_id INT REFERENCES neighborhoods(id) ON DELETE CASCADE,
    category VARCHAR(255),
    metric_name VARCHAR(255),
    metric_value VARCHAR(255),
    data_source VARCHAR(255),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 10. AI Generation Logs
-- ============================================
CREATE TABLE IF NOT EXISTS ai_generation_logs (
    id SERIAL PRIMARY KEY,
    prompt TEXT,
    response JSONB,
    model VARCHAR(255),
    tokens_used INT,
    latency_ms INT,
    truck_id INT,
    neighborhood VARCHAR(255),
    campaign_id INT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 11. A/B Tests
-- ============================================
CREATE TABLE IF NOT EXISTS ab_tests (
    id SERIAL PRIMARY KEY,
    campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
    test_name VARCHAR(255) NOT NULL,
    headline_a TEXT NOT NULL,
    headline_b TEXT NOT NULL,
    impressions_a INT DEFAULT 0,
    impressions_b INT DEFAULT 0,
    conversions_a INT DEFAULT 0,
    conversions_b INT DEFAULT 0,
    start_date TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_gps_locations_truck_id ON gps_locations(truck_id);
CREATE INDEX IF NOT EXISTS idx_gps_locations_recorded_at ON gps_locations(recorded_at);
CREATE INDEX IF NOT EXISTS idx_headlines_campaign_id ON headlines(campaign_id);
CREATE INDEX IF NOT EXISTS idx_headlines_truck_id ON headlines(truck_id);
CREATE INDEX IF NOT EXISTS idx_headlines_neighborhood_id ON headlines(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_billboard_displays_truck_id ON billboard_displays(truck_id);
CREATE INDEX IF NOT EXISTS idx_billboard_displays_headline_id ON billboard_displays(headline_id);
CREATE INDEX IF NOT EXISTS idx_analytics_campaign_id ON analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(date);
CREATE INDEX IF NOT EXISTS idx_demographic_data_neighborhood_id ON demographic_data(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_campaign_id ON ai_generation_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_campaign_id ON ab_tests(campaign_id);

-- ============================================
-- 12. Geofences (auto-trigger AI re-generation)
-- ============================================
CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL PRIMARY KEY,
    neighborhood_id INT REFERENCES neighborhoods(id) ON DELETE CASCADE,
    name VARCHAR(255),
    center_latitude DECIMAL(10, 8),
    center_longitude DECIMAL(11, 8),
    radius_meters INT DEFAULT 500,
    auto_generate BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 13. Brand-safety scores per headline
-- ============================================
CREATE TABLE IF NOT EXISTS brand_safety_scores (
    id SERIAL PRIMARY KEY,
    headline_id INT REFERENCES headlines(id) ON DELETE CASCADE,
    overall_score DECIMAL,
    risk_level VARCHAR(50),
    issues JSONB,
    ai_results JSONB,
    raw_response TEXT,
    model VARCHAR(255),
    tokens_used INT,
    latency_ms INT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 14. Weather-aware contexts (cached)
-- ============================================
CREATE TABLE IF NOT EXISTS weather_contexts (
    id SERIAL PRIMARY KEY,
    neighborhood_id INT REFERENCES neighborhoods(id) ON DELETE CASCADE,
    weather_summary TEXT,
    weather_data JSONB,
    fetched_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofences_neighborhood_id ON geofences(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_brand_safety_headline_id ON brand_safety_scores(headline_id);
CREATE INDEX IF NOT EXISTS idx_weather_contexts_neighborhood_id ON weather_contexts(neighborhood_id);
