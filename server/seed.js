const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

if (process.env.CONFIRM_DEMO_SEED !== 'yes') {
  throw new Error('Refusing destructive seed without CONFIRM_DEMO_SEED=yes');
}

// ============================================
// Colored console helpers
// ============================================
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function logStep(msg) {
  console.log(`${c.cyan}[STEP]${c.reset} ${msg}`);
}
function logSuccess(msg) {
  console.log(`${c.green}[OK]${c.reset}   ${msg}`);
}
function logError(msg) {
  console.log(`${c.red}[ERR]${c.reset}  ${msg}`);
}
function logInfo(msg) {
  console.log(`${c.yellow}[INFO]${c.reset} ${msg}`);
}
function logTitle(msg) {
  console.log(`\n${c.bold}${c.magenta}${'='.repeat(50)}${c.reset}`);
  console.log(`${c.bold}${c.magenta}  ${msg}${c.reset}`);
  console.log(`${c.bold}${c.magenta}${'='.repeat(50)}${c.reset}\n`);
}

// ============================================
// Database config
// ============================================
const DB_NAME = process.env.DB_NAME;
const baseConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

// ============================================
// Main seed function
// ============================================
async function seed() {
  logTitle('Dynamic Location-Aware Advertising Platform - Database Seed');

  // ------------------------------------------
  // 1. Drop & recreate the database
  // ------------------------------------------
  logStep('Connecting to postgres to manage database...');
  const adminPool = new Pool({ ...baseConfig, database: 'postgres' });

  try {
    // Terminate existing connections
    await adminPool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${DB_NAME}'
        AND pid <> pg_backend_pid();
    `);
    logInfo(`Terminated existing connections to "${DB_NAME}"`);

    await adminPool.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    logSuccess(`Dropped database "${DB_NAME}" (if existed)`);

    await adminPool.query(`CREATE DATABASE ${DB_NAME}`);
    logSuccess(`Created fresh database "${DB_NAME}"`);
  } catch (err) {
    logError(`Database creation failed: ${err.message}`);
    throw err;
  } finally {
    await adminPool.end();
  }

  // ------------------------------------------
  // 2. Run schema.sql
  // ------------------------------------------
  logStep('Running schema.sql...');
  const appPool = new Pool({ ...baseConfig, database: DB_NAME });

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    await appPool.query(schemaSql);
    logSuccess('Schema created successfully');
  } catch (err) {
    logError(`Schema execution failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // 3. Seed Users
  // ------------------------------------------
  logStep('Seeding users...');
  try {
    const demoEmail = process.env.DEMO_EMAIL || '';
    const demoPassword = process.env.DEMO_PASSWORD || '';
    if (!demoEmail.includes('@')) throw new Error('DEMO_EMAIL must be a valid email address');
    if (demoPassword.length < 12) throw new Error('DEMO_PASSWORD must be at least 12 characters');
    const hashedPw = await bcrypt.hash(demoPassword, 10);
    const users = [
      [demoEmail, hashedPw, 'Admin User', 'admin', 'https://ui-avatars.com/api/?name=Admin+User&background=6366f1&color=fff'],
      ['manager@dynamicads.com', hashedPw, 'Campaign Manager', 'manager', 'https://ui-avatars.com/api/?name=Campaign+Manager&background=22c55e&color=fff'],
      ['viewer@dynamicads.com', hashedPw, 'Data Viewer', 'viewer', 'https://ui-avatars.com/api/?name=Data+Viewer&background=f59e0b&color=fff'],
    ];
    for (const u of users) {
      await appPool.query(
        'INSERT INTO users (email, password, name, role, avatar) VALUES ($1, $2, $3, $4, $5)',
        u
      );
    }
    logSuccess(`Seeded ${users.length} users`);
  } catch (err) {
    logError(`Users seed failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // 4. Seed Trucks
  // ------------------------------------------
  logStep('Seeding trucks...');
  try {
    const trucks = [
      ['Eagle-01', 'TX-4821-AD', 'Marcus Johnson', 'active', '12x6', 'Downtown Loop', 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=400'],
      ['Hawk-02', 'CA-9173-BD', 'Sarah Chen', 'active', '10x4', 'Sunset Boulevard', 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=400'],
      ['Falcon-03', 'NY-2847-CD', 'James Williams', 'active', '12x6', 'Midtown Manhattan', 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400'],
      ['Osprey-04', 'IL-5632-DD', 'Maria Garcia', 'active', '8x3', 'Michigan Avenue', 'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=400'],
      ['Raven-05', 'TX-7741-ED', 'David Brown', 'maintenance', '10x4', 'Galleria Area', 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400'],
      ['Phoenix-06', 'AZ-3318-FD', 'Emily Davis', 'active', '12x6', 'Scottsdale Loop', 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400'],
      ['Condor-07', 'CA-8856-GD', 'Robert Martinez', 'active', '10x4', 'Hollywood Circuit', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400'],
      ['Kestrel-08', 'NY-1294-HD', 'Lisa Anderson', 'inactive', '8x3', 'Brooklyn Heights', 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400'],
      ['Harrier-09', 'IL-6483-JD', 'Michael Thompson', 'active', '12x6', 'Wicker Park Route', 'https://images.unsplash.com/photo-1562674469-da7bfde0d8b0?w=400'],
      ['Sparrow-10', 'TX-9927-KD', 'Jennifer Wilson', 'active', '10x4', 'River Oaks Loop', 'https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=400'],
      ['Merlin-11', 'AZ-4451-LD', 'Daniel Lee', 'active', '8x3', 'Tempe University', 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400'],
      ['Peregrine-12', 'CA-2285-MD', 'Amanda Taylor', 'maintenance', '12x6', 'Venice Beach Blvd', 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400'],
      ['Vulture-13', 'NY-7719-ND', 'Christopher Moore', 'active', '10x4', 'SoHo District', 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=400'],
      ['Albatross-14', 'IL-3356-PD', 'Jessica Jackson', 'active', '12x6', 'Lincoln Park', 'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=400'],
      ['Nighthawk-15', 'TX-5584-QD', 'Kevin White', 'active', '8x3', 'Medical Center Loop', 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400'],
    ];
    for (const t of trucks) {
      await appPool.query(
        'INSERT INTO trucks (name, plate_number, driver_name, status, billboard_size, route_name, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        t
      );
    }
    logSuccess(`Seeded ${trucks.length} trucks`);
  } catch (err) {
    logError(`Trucks seed failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // 5. Seed GPS Locations (3 per truck = 45)
  // ------------------------------------------
  logStep('Seeding GPS locations...');
  try {
    const gpsData = [
      // Eagle-01 - Houston
      [1, 29.76043080, -95.36980290, 28.5, 180, 'Downtown', 'Houston', 'TX'],
      [1, 29.75518350, -95.36329270, 32.1, 195, 'Midtown', 'Houston', 'TX'],
      [1, 29.74732800, -95.35844800, 15.0, 210, 'Museum District', 'Houston', 'TX'],
      // Hawk-02 - Los Angeles
      [2, 34.09780000, -118.32870000, 22.3, 270, 'Silver Lake', 'Los Angeles', 'CA'],
      [2, 34.09010000, -118.36130000, 18.7, 265, 'Hollywood', 'Los Angeles', 'CA'],
      [2, 34.04830000, -118.25470000, 35.2, 90, 'Arts District', 'Los Angeles', 'CA'],
      // Falcon-03 - New York
      [3, 40.75480000, -73.98410000, 12.4, 45, 'Times Square', 'New York', 'NY'],
      [3, 40.74840000, -73.98570000, 8.9, 180, 'Herald Square', 'New York', 'NY'],
      [3, 40.75890000, -73.97940000, 15.6, 0, 'Columbus Circle', 'New York', 'NY'],
      // Osprey-04 - Chicago
      [4, 41.88820000, -87.63240000, 20.1, 90, 'The Loop', 'Chicago', 'IL'],
      [4, 41.89490000, -87.62400000, 25.3, 45, 'Magnificent Mile', 'Chicago', 'IL'],
      [4, 41.88230000, -87.62860000, 18.0, 135, 'Grant Park', 'Chicago', 'IL'],
      // Raven-05 - Houston
      [5, 29.73840000, -95.46040000, 0.0, 0, 'Galleria', 'Houston', 'TX'],
      [5, 29.74320000, -95.45610000, 0.0, 0, 'Uptown', 'Houston', 'TX'],
      [5, 29.73510000, -95.44920000, 0.0, 0, 'Post Oak', 'Houston', 'TX'],
      // Phoenix-06 - Phoenix
      [6, 33.50780000, -111.92720000, 30.2, 315, 'Old Town Scottsdale', 'Scottsdale', 'AZ'],
      [6, 33.49530000, -111.92600000, 28.5, 300, 'Fashion Square', 'Scottsdale', 'AZ'],
      [6, 33.44830000, -112.07400000, 33.1, 180, 'Downtown Phoenix', 'Phoenix', 'AZ'],
      // Condor-07 - Los Angeles
      [7, 34.10170000, -118.34140000, 19.4, 240, 'Hollywood Blvd', 'Los Angeles', 'CA'],
      [7, 34.06220000, -118.35160000, 22.8, 180, 'Beverly Hills', 'Los Angeles', 'CA'],
      [7, 34.01940000, -118.49120000, 26.3, 270, 'Santa Monica', 'Los Angeles', 'CA'],
      // Kestrel-08 - New York
      [8, 40.69590000, -73.99410000, 0.0, 0, 'Brooklyn Heights', 'Brooklyn', 'NY'],
      [8, 40.71430000, -73.96130000, 0.0, 0, 'Williamsburg', 'Brooklyn', 'NY'],
      [8, 40.68430000, -73.97720000, 0.0, 0, 'Park Slope', 'Brooklyn', 'NY'],
      // Harrier-09 - Chicago
      [9, 41.90880000, -87.67720000, 24.6, 90, 'Wicker Park', 'Chicago', 'IL'],
      [9, 41.91210000, -87.67940000, 19.3, 45, 'Bucktown', 'Chicago', 'IL'],
      [9, 41.92330000, -87.64870000, 22.1, 0, 'Lincoln Park', 'Chicago', 'IL'],
      // Sparrow-10 - Houston
      [10, 29.73590000, -95.41930000, 27.8, 90, 'River Oaks', 'Houston', 'TX'],
      [10, 29.73050000, -95.40120000, 30.1, 135, 'Montrose', 'Houston', 'TX'],
      [10, 29.74630000, -95.39330000, 24.5, 45, 'Heights', 'Houston', 'TX'],
      // Merlin-11 - Phoenix
      [11, 33.42550000, -111.94010000, 22.0, 180, 'Tempe', 'Tempe', 'AZ'],
      [11, 33.41480000, -111.90910000, 25.4, 270, 'ASU Campus', 'Tempe', 'AZ'],
      [11, 33.44570000, -111.94480000, 19.6, 90, 'Mill Avenue', 'Tempe', 'AZ'],
      // Peregrine-12 - Los Angeles
      [12, 33.98510000, -118.46960000, 0.0, 0, 'Venice Beach', 'Los Angeles', 'CA'],
      [12, 33.99190000, -118.47210000, 0.0, 0, 'Venice Canals', 'Los Angeles', 'CA'],
      [12, 34.00050000, -118.48930000, 0.0, 0, 'Marina del Rey', 'Los Angeles', 'CA'],
      // Vulture-13 - New York
      [13, 40.72300000, -74.00000000, 14.2, 0, 'SoHo', 'New York', 'NY'],
      [13, 40.72870000, -73.99460000, 11.8, 45, 'NoHo', 'New York', 'NY'],
      [13, 40.71980000, -74.00610000, 16.5, 270, 'Tribeca', 'New York', 'NY'],
      // Albatross-14 - Chicago
      [14, 41.92140000, -87.64960000, 21.3, 0, 'Lincoln Park', 'Chicago', 'IL'],
      [14, 41.93250000, -87.64390000, 18.9, 315, 'Lakeview', 'Chicago', 'IL'],
      [14, 41.94960000, -87.65420000, 23.4, 0, 'Wrigleyville', 'Chicago', 'IL'],
      // Nighthawk-15 - Houston
      [15, 29.70720000, -95.39850000, 20.7, 225, 'Medical Center', 'Houston', 'TX'],
      [15, 29.71440000, -95.39340000, 26.3, 180, 'Hermann Park', 'Houston', 'TX'],
      [15, 29.72110000, -95.38920000, 18.9, 135, 'Rice Village', 'Houston', 'TX'],
    ];
    for (const g of gpsData) {
      await appPool.query(
        'INSERT INTO gps_locations (truck_id, latitude, longitude, speed, heading, neighborhood, city, state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        g
      );
    }
    logSuccess(`Seeded ${gpsData.length} GPS locations`);
  } catch (err) {
    logError(`GPS locations seed failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // 6. Seed Neighborhoods
  // ------------------------------------------
  logStep('Seeding neighborhoods...');
  try {
    const neighborhoods = [
      ['Williamsburg', 'Brooklyn', 'NY', '11211', 40.71430000, -73.96130000, 78000, 31.2, 72000, 'Trendy Brooklyn neighborhood known for art, music, and tech startups.', '{craft coffee,vintage shopping,tech startups,street art,indie music}', '{young professionals,creative class,millennials}'],
      ['Silver Lake', 'Los Angeles', 'CA', '90026', 34.08660000, -118.27000000, 32000, 33.5, 68000, 'Hip LA neighborhood with a bohemian vibe and eclectic dining scene.', '{indie music,vegan dining,yoga,hiking,boutique shopping}', '{creative class,young professionals,health conscious}'],
      ['Wicker Park', 'Chicago', 'IL', '60622', 41.90880000, -87.67720000, 35000, 30.8, 75000, 'Chicago cultural hub with vibrant nightlife and independent shops.', '{craft beer,live music,vintage clothing,art galleries,farm-to-table}', '{young professionals,nightlife enthusiasts,artists}'],
      ['Midtown Manhattan', 'New York', 'NY', '10018', 40.75480000, -73.98410000, 65000, 38.4, 95000, 'The commercial heart of NYC with world-class entertainment.', '{theater,fine dining,luxury shopping,business networking,tourism}', '{business professionals,tourists,high income}'],
      ['River Oaks', 'Houston', 'TX', '77019', 29.73590000, -95.41930000, 21000, 45.2, 150000, 'Affluent Houston neighborhood with upscale shopping and dining.', '{luxury shopping,fine dining,golf,country clubs,philanthropy}', '{affluent families,executives,high net worth}'],
      ['Old Town Scottsdale', 'Scottsdale', 'AZ', '85251', 33.49530000, -111.92600000, 18000, 42.1, 82000, 'Desert chic district with art galleries and southwestern cuisine.', '{art galleries,southwestern cuisine,spa retreats,golf,wine tasting}', '{retirees,tourists,art enthusiasts}'],
      ['SoHo', 'New York', 'NY', '10012', 40.72300000, -74.00000000, 45000, 34.7, 110000, 'Iconic NYC neighborhood famous for cast-iron architecture and fashion.', '{fashion boutiques,art galleries,brunch spots,luxury brands,photography}', '{fashionistas,young professionals,high income}'],
      ['Hollywood', 'Los Angeles', 'CA', '90028', 34.09810000, -118.32680000, 85000, 36.3, 55000, 'Entertainment capital with iconic landmarks and diverse culture.', '{entertainment,nightlife,tourism,street food,celebrity culture}', '{entertainment workers,tourists,diverse demographics}'],
      ['Lincoln Park', 'Chicago', 'IL', '60614', 41.92140000, -87.64960000, 68000, 32.6, 88000, 'Family-friendly Chicago neighborhood near the lakefront.', '{jogging,farmers markets,boutique shopping,brunch,lakefront activities}', '{young families,professionals,fitness enthusiasts}'],
      ['Montrose', 'Houston', 'TX', '77006', 29.73050000, -95.40120000, 28000, 34.1, 62000, 'Eclectic Houston neighborhood known for diversity and culture.', '{vintage stores,food trucks,live music,murals,craft cocktails}', '{diverse community,young professionals,LGBTQ+ friendly}'],
      ['Venice Beach', 'Los Angeles', 'CA', '90291', 33.98510000, -118.46960000, 41000, 35.8, 72000, 'Iconic boardwalk community with beach culture and street performers.', '{surfing,skateboarding,street art,organic food,fitness}', '{beach lovers,fitness enthusiasts,creative class}'],
      ['Brooklyn Heights', 'Brooklyn', 'NY', '11201', 40.69590000, -73.99410000, 23000, 38.9, 125000, 'Historic Brooklyn neighborhood with brownstones and waterfront views.', '{fine dining,historic architecture,waterfront walks,bookshops,wine bars}', '{affluent families,professionals,history enthusiasts}'],
      ['The Loop', 'Chicago', 'IL', '60601', 41.88200000, -87.62860000, 42000, 37.5, 78000, 'Chicago downtown core with iconic architecture and business district.', '{architecture tours,business dining,theater,public art,rooftop bars}', '{business professionals,tourists,commuters}'],
      ['Downtown Phoenix', 'Phoenix', 'AZ', '85004', 33.44830000, -112.07400000, 35000, 33.2, 52000, 'Revitalized urban core with growing food and arts scene.', '{craft breweries,food halls,first friday art walks,basketball,light rail}', '{young professionals,urban pioneers,sports fans}'],
      ['Heights', 'Houston', 'TX', '77008', 29.79020000, -95.39760000, 44000, 36.7, 85000, 'Historic Houston neighborhood with tree-lined streets and local shops.', '{antique shopping,craft coffee,running trails,pet friendly,local breweries}', '{young families,professionals,pet owners}'],
      ['Tempe', 'Tempe', 'AZ', '85281', 33.42550000, -111.94010000, 55000, 24.6, 38000, 'College town vibe with ASU campus driving youthful energy.', '{college sports,late night eats,study cafes,music festivals,budget shopping}', '{college students,young adults,budget conscious}'],
      ['Park Slope', 'Brooklyn', 'NY', '11215', 40.67210000, -73.97770000, 67000, 36.4, 105000, 'Family-oriented Brooklyn neighborhood with top-rated schools.', '{organic grocery,playground outings,book clubs,family dining,yoga}', '{young families,professionals,education focused}'],
      ['Beverly Hills', 'Los Angeles', 'CA', '90210', 34.07360000, -118.40010000, 33000, 44.8, 165000, 'World-famous luxury enclave with high-end shopping.', '{luxury brands,fine dining,spas,celebrity spotting,art collecting}', '{high net worth,celebrities,luxury shoppers}'],
      ['Lakeview', 'Chicago', 'IL', '60657', 41.94320000, -87.65280000, 98000, 31.3, 72000, 'Diverse Chicago neighborhood known for Wrigley Field and nightlife.', '{baseball,craft beer,brunch,comedy shows,live music}', '{young professionals,sports fans,nightlife enthusiasts}'],
      ['Galleria Area', 'Houston', 'TX', '77056', 29.73840000, -95.46040000, 38000, 35.9, 78000, 'Major shopping and business district in Houston.', '{shopping malls,business lunch,fitness centers,happy hour,networking}', '{professionals,shoppers,suburban commuters}'],
    ];
    for (const n of neighborhoods) {
      await appPool.query(
        `INSERT INTO neighborhoods (name, city, state, zipcode, latitude, longitude, population, median_age, median_income, description, top_interests, demographic_tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        n
      );
    }
    logSuccess(`Seeded ${neighborhoods.length} neighborhoods`);
  } catch (err) {
    logError(`Neighborhoods seed failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // 7. Seed Campaigns
  // ------------------------------------------
  logStep('Seeding campaigns...');
  try {
    const campaigns = [
      ['Summer Moving Season', 'MovePro Logistics', 25000, '2026-05-01', '2026-08-31', 'active', '{young professionals,college students,renters}', '{Williamsburg,Silver Lake,Wicker Park,Montrose}', 'Target young movers in trendy urban neighborhoods during peak moving season.'],
      ['Back to School 2026', 'EduTech Solutions', 18000, '2026-07-15', '2026-09-15', 'active', '{families,college students,parents}', '{Park Slope,Lincoln Park,Tempe,Heights}', 'Promote educational products and services for the new school year.'],
      ['Holiday Special', 'GiftBox Premium', 45000, '2026-11-01', '2026-12-31', 'draft', '{shoppers,families,high income}', '{Midtown Manhattan,Beverly Hills,River Oaks,Galleria Area}', 'Luxury holiday gift campaign targeting affluent shopping districts.'],
      ['Tech District Push', 'CloudServe Inc', 32000, '2026-03-01', '2026-06-30', 'active', '{tech workers,young professionals,startups}', '{Williamsburg,Silver Lake,Wicker Park,Downtown Phoenix}', 'B2B cloud services targeting tech hubs and startup neighborhoods.'],
      ['Family Neighborhood Blitz', 'FamilyFun Parks', 15000, '2026-04-01', '2026-09-30', 'active', '{families,parents,children}', '{Park Slope,Lincoln Park,Heights,Brooklyn Heights}', 'Promote family entertainment venues in family-friendly neighborhoods.'],
      ['Fitness Revolution', 'FlexGym Network', 22000, '2026-01-01', '2026-04-30', 'active', '{fitness enthusiasts,health conscious,young adults}', '{Venice Beach,Lincoln Park,Montrose,Silver Lake}', 'New year fitness campaign targeting health-conscious communities.'],
      ['Luxury Auto Launch', 'Prestige Motors', 50000, '2026-03-15', '2026-06-15', 'active', '{high income,executives,luxury shoppers}', '{Beverly Hills,River Oaks,Brooklyn Heights,SoHo}', 'Launch campaign for premium electric vehicle line.'],
      ['Local Eats Festival', 'FoodieApp', 12000, '2026-05-15', '2026-07-15', 'draft', '{foodies,young professionals,diverse community}', '{Hollywood,Montrose,Wicker Park,SoHo}', 'Promote local restaurant discovery app in food-forward neighborhoods.'],
      ['College Kickoff', 'StudentDeal Hub', 8000, '2026-08-01', '2026-09-30', 'draft', '{college students,young adults,budget conscious}', '{Tempe,Williamsburg,Lakeview}', 'Student deals and services for the new academic year.'],
      ['Desert Wellness', 'Oasis Spa Group', 20000, '2026-02-01', '2026-05-31', 'active', '{retirees,health conscious,tourists}', '{Old Town Scottsdale,Downtown Phoenix,Tempe}', 'Premium wellness and spa services in Arizona markets.'],
      ['Spring Real Estate', 'HomeVista Realty', 35000, '2026-03-01', '2026-05-31', 'active', '{young families,professionals,renters}', '{Park Slope,Heights,Lincoln Park,River Oaks}', 'Spring home buying season targeting potential buyers.'],
      ['Art & Culture Week', 'MetroArts Foundation', 10000, '2026-04-10', '2026-04-20', 'draft', '{art enthusiasts,creative class,tourists}', '{SoHo,Silver Lake,Wicker Park,Old Town Scottsdale}', 'Promote city-wide arts and culture festival.'],
      ['Summer Beverage Blast', 'CraftBrew Collective', 16000, '2026-06-01', '2026-08-31', 'active', '{young professionals,nightlife enthusiasts,craft beer fans}', '{Lakeview,Wicker Park,Montrose,Williamsburg}', 'Summer craft beverage promotion across nightlife districts.'],
      ['Pet Paradise Campaign', 'PawsPlus Stores', 11000, '2026-04-01', '2026-07-31', 'active', '{pet owners,young families,outdoor enthusiasts}', '{Heights,Venice Beach,Lincoln Park,Park Slope}', 'Pet products and services for pet-friendly neighborhoods.'],
      ['Financial Freedom Tour', 'WealthPath Advisors', 28000, '2026-03-01', '2026-12-31', 'active', '{professionals,high income,business professionals}', '{Midtown Manhattan,The Loop,Galleria Area,Beverly Hills}', 'Year-long financial advisory services campaign.'],
    ];
    for (const c of campaigns) {
      await appPool.query(
        `INSERT INTO campaigns (name, client_name, budget, start_date, end_date, status, target_demographics, target_neighborhoods, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        c
      );
    }
    logSuccess(`Seeded ${campaigns.length} campaigns`);
  } catch (err) {
    logError(`Campaigns seed failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // 8. Seed Headlines
  // ------------------------------------------
  logStep('Seeding headlines...');
  try {
    const headlines = [
      [1, 1, 1, 'Moving to Brooklyn? We Make It Effortless.', 'Generate a headline for a moving company targeting young professionals in Williamsburg, Brooklyn', JSON.stringify({ options: ['Moving to Brooklyn? We Make It Effortless.', 'Your Williamsburg Move, Stress-Free.', 'Brooklyn Bound? Start Packing Dreams.'], selected: 0, model: 'gpt-4' }), 'professional', 'confident', 'active', 1250],
      [1, 2, 2, 'Silver Lake Movers: Start Fresh, Live Bold', 'Generate a headline for a moving company targeting creatives in Silver Lake, LA', JSON.stringify({ options: ['Silver Lake Movers: Start Fresh, Live Bold', 'New Pad in Silver Lake? We Got You.', 'Move Like a Local in Silver Lake.'], selected: 0, model: 'gpt-4' }), 'bold', 'energetic', 'active', 980],
      [2, 3, 4, 'Back to School? NYC Has Everything You Need', 'Generate a headline for back to school products in Midtown Manhattan', JSON.stringify({ options: ['Back to School? NYC Has Everything You Need', 'School Starts Soon - Manhattan Ready!', 'Smart Starts in the City That Never Sleeps'], selected: 0, model: 'gpt-4' }), 'casual', 'friendly', 'active', 2100],
      [4, 1, 1, 'Cloud Solutions for Brooklyn Startups', 'Generate a headline for B2B cloud services targeting tech startups in Williamsburg', JSON.stringify({ options: ['Cloud Solutions for Brooklyn Startups', 'Scale Your Startup. Brooklyn Style.', 'From Garage to Cloud. We Power Brooklyn Tech.'], selected: 0, model: 'gpt-4' }), 'professional', 'authoritative', 'active', 870],
      [4, 2, 2, 'LA Tech Runs on CloudServe', 'Generate a headline for cloud services targeting Silver Lake tech community', JSON.stringify({ options: ['LA Tech Runs on CloudServe', 'Silver Lake Innovators Choose CloudServe', 'Code. Deploy. Scale. Silver Lake Style.'], selected: 0, model: 'gpt-4' }), 'witty', 'modern', 'active', 1520],
      [5, 4, 9, 'Lincoln Park Families: Adventure Awaits!', 'Generate a headline for family entertainment near Lincoln Park, Chicago', JSON.stringify({ options: ['Lincoln Park Families: Adventure Awaits!', 'Fun for the Whole Family in Lincoln Park', 'Weekend Plans? FamilyFun Has You Covered.'], selected: 0, model: 'gpt-4' }), 'casual', 'warm', 'active', 3200],
      [6, 7, 11, 'Venice Beach Gets Fit with FlexGym', 'Generate a headline for a gym chain targeting fitness enthusiasts in Venice Beach', JSON.stringify({ options: ['Venice Beach Gets Fit with FlexGym', 'Train Like a Local. Venice Beach Strong.', 'Sun. Sand. Sweat. FlexGym Venice.'], selected: 0, model: 'gpt-4' }), 'bold', 'energetic', 'active', 4100],
      [7, 13, 7, 'Drive Electric. Drive SoHo.', 'Generate a headline for luxury electric cars targeting SoHo, NYC residents', JSON.stringify({ options: ['Drive Electric. Drive SoHo.', 'The Future of Luxury is Electric. SoHo Approved.', 'Prestige EV: Where SoHo Meets Sustainability.'], selected: 0, model: 'gpt-4' }), 'witty', 'luxurious', 'active', 1890],
      [3, 3, 4, 'Holiday Magic in Times Square', 'Generate a holiday gift campaign headline for Midtown Manhattan', JSON.stringify({ options: ['Holiday Magic in Times Square', 'Give the Gift of NYC This Holiday', 'Unwrap Something Special in Manhattan'], selected: 0, model: 'gpt-4' }), 'professional', 'festive', 'active', 5600],
      [10, 6, 6, 'Relax. Renew. Scottsdale Style.', 'Generate a wellness spa headline for Old Town Scottsdale', JSON.stringify({ options: ['Relax. Renew. Scottsdale Style.', 'Desert Serenity Awaits at Oasis Spa', 'Scottsdale Wellness: Your Escape is Here.'], selected: 0, model: 'gpt-4' }), 'professional', 'calming', 'active', 760],
      [11, 14, 9, 'Your Dream Home in Lincoln Park Awaits', 'Generate a real estate headline for Lincoln Park, Chicago buyers', JSON.stringify({ options: ['Your Dream Home in Lincoln Park Awaits', 'Lincoln Park Living: Find Your Perfect Home', 'Spring Into Your New Lincoln Park Home'], selected: 0, model: 'gpt-4' }), 'professional', 'aspirational', 'active', 1340],
      [13, 9, 3, 'Cheers to Wicker Park Craft Brews', 'Generate a craft beer headline for Wicker Park, Chicago', JSON.stringify({ options: ['Cheers to Wicker Park Craft Brews', 'Wicker Park: Where Every Sip Tells a Story', 'Craft. Local. Wicker Park.'], selected: 0, model: 'gpt-4' }), 'casual', 'fun', 'active', 2870],
      [14, 10, 15, 'Houston Heights: A Dog Walker Paradise', 'Generate a pet-friendly headline for the Heights neighborhood, Houston', JSON.stringify({ options: ['Houston Heights: A Dog Walker Paradise', 'Paws Up, Heights! PawsPlus Is Here.', 'Every Pet Deserves the Heights Life.'], selected: 0, model: 'gpt-4' }), 'witty', 'playful', 'active', 950],
      [15, 3, 4, 'Smart Money Moves in Manhattan', 'Generate a financial services headline for Midtown Manhattan professionals', JSON.stringify({ options: ['Smart Money Moves in Manhattan', 'Manhattan Professionals Trust WealthPath', 'Your Financial Future Starts in Midtown'], selected: 0, model: 'gpt-4' }), 'professional', 'authoritative', 'active', 3450],
      [9, 11, 16, 'Tempe Students: Deals You Actually Want', 'Generate a student deals headline for Tempe, AZ college area', JSON.stringify({ options: ['Tempe Students: Deals You Actually Want', 'ASU Approved. Wallet Friendly.', 'Student Life in Tempe Just Got Better.'], selected: 0, model: 'gpt-4' }), 'casual', 'youthful', 'active', 4200],
      [2, 14, 17, 'Park Slope Parents: School Ready?', 'Generate a back to school headline for parents in Park Slope, Brooklyn', JSON.stringify({ options: ['Park Slope Parents: School Ready?', 'Everything Your Kid Needs for School. Park Slope Delivered.', 'A+ Starts in Park Slope.'], selected: 0, model: 'gpt-4' }), 'casual', 'warm', 'active', 1100],
      [8, 9, 3, 'Wicker Park Eats: Discover Your New Favorite', 'Generate a food app headline for Wicker Park, Chicago', JSON.stringify({ options: ['Wicker Park Eats: Discover Your New Favorite', 'Hungry in Wicker Park? We Know a Place.', 'Every Bite Tells a Wicker Park Story.'], selected: 0, model: 'gpt-4' }), 'witty', 'inviting', 'active', 1680],
      [12, 7, 7, 'SoHo Art Walk: This Weekend Only', 'Generate an arts event headline for SoHo, NYC', JSON.stringify({ options: ['SoHo Art Walk: This Weekend Only', 'Art Lives in SoHo. Come See Why.', 'SoHo Streets Become Galleries This Weekend.'], selected: 0, model: 'gpt-4' }), 'bold', 'exciting', 'active', 890],
      [6, 9, 3, 'Wicker Park: Where Fitness Meets Community', 'Generate a fitness headline for Wicker Park, Chicago', JSON.stringify({ options: ['Wicker Park: Where Fitness Meets Community', 'Get Fit with Your Wicker Park Neighbors', 'FlexGym Wicker Park: Join the Movement.'], selected: 0, model: 'gpt-4' }), 'casual', 'community', 'active', 2340],
      [7, 10, 5, 'River Oaks Luxury: The Prestige EV Experience', 'Generate a luxury auto headline for River Oaks, Houston', JSON.stringify({ options: ['River Oaks Luxury: The Prestige EV Experience', 'Electric Elegance for River Oaks', 'The Car River Oaks Has Been Waiting For.'], selected: 0, model: 'gpt-4' }), 'professional', 'luxurious', 'active', 1560],
    ];
    for (const h of headlines) {
      await appPool.query(
        `INSERT INTO headlines (campaign_id, truck_id, neighborhood_id, headline_text, ai_prompt, ai_response, style, tone, status, impressions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        h
      );
    }
    logSuccess(`Seeded ${headlines.length} headlines`);
  } catch (err) {
    logError(`Headlines seed failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // 9. Seed Billboard Displays
  // ------------------------------------------
  logStep('Seeding billboard displays...');
  try {
    const displays = [
      [1, 1, 'Williamsburg', '2026-03-10 08:30:00', 40.71430000, -73.96130000, 120, 'displayed'],
      [1, 1, 'Williamsburg', '2026-03-10 10:15:00', 40.71480000, -73.96200000, 90, 'displayed'],
      [2, 2, 'Silver Lake', '2026-03-10 09:00:00', 34.08660000, -118.27000000, 150, 'displayed'],
      [3, 3, 'Times Square', '2026-03-10 11:00:00', 40.75480000, -73.98410000, 60, 'displayed'],
      [3, 3, 'Herald Square', '2026-03-10 11:45:00', 40.74840000, -73.98570000, 80, 'displayed'],
      [4, 4, 'The Loop', '2026-03-10 08:00:00', 41.88200000, -87.62860000, 110, 'displayed'],
      [6, 6, 'Old Town Scottsdale', '2026-03-10 10:30:00', 33.49530000, -111.92600000, 130, 'displayed'],
      [7, 7, 'Hollywood Blvd', '2026-03-10 12:00:00', 34.10170000, -118.34140000, 95, 'displayed'],
      [7, 8, 'SoHo', '2026-03-11 09:30:00', 40.72300000, -74.00000000, 140, 'displayed'],
      [9, 9, 'Wicker Park', '2026-03-11 10:00:00', 41.90880000, -87.67720000, 100, 'displayed'],
      [10, 10, 'River Oaks', '2026-03-11 08:45:00', 29.73590000, -95.41930000, 115, 'displayed'],
      [10, 10, 'Montrose', '2026-03-11 10:30:00', 29.73050000, -95.40120000, 85, 'displayed'],
      [11, 11, 'Tempe', '2026-03-11 11:00:00', 33.42550000, -111.94010000, 70, 'displayed'],
      [13, 12, 'SoHo', '2026-03-11 14:00:00', 40.72300000, -74.00000000, 125, 'displayed'],
      [14, 13, 'Lincoln Park', '2026-03-12 08:15:00', 41.92140000, -87.64960000, 90, 'displayed'],
      [14, 14, 'Heights', '2026-03-12 09:00:00', 29.79020000, -95.39760000, 105, 'displayed'],
      [1, 1, 'Wicker Park', '2026-03-12 10:30:00', 41.90880000, -87.67720000, 80, 'displayed'],
      [2, 5, 'Venice Beach', '2026-03-12 11:15:00', 33.98510000, -118.46960000, 135, 'displayed'],
      [3, 6, 'Midtown Manhattan', '2026-03-12 12:00:00', 40.75480000, -73.98410000, 65, 'displayed'],
      [4, 7, 'Downtown Phoenix', '2026-03-12 13:00:00', 33.44830000, -112.07400000, 110, 'displayed'],
      [9, 15, 'Tempe', '2026-03-12 14:30:00', 33.42550000, -111.94010000, 95, 'displayed'],
      [13, 9, 'Lakeview', '2026-03-13 08:00:00', 41.94320000, -87.65280000, 120, 'displayed'],
      [6, 2, 'Venice Beach', '2026-03-13 09:30:00', 33.98510000, -118.46960000, 140, 'displayed'],
      [7, 13, 'Tribeca', '2026-03-13 10:45:00', 40.71980000, -74.00610000, 100, 'displayed'],
      [15, 14, 'Galleria Area', '2026-03-13 11:30:00', 29.73840000, -95.46040000, 85, 'displayed'],
    ];
    for (const d of displays) {
      await appPool.query(
        `INSERT INTO billboard_displays (truck_id, headline_id, neighborhood, displayed_at, latitude, longitude, duration_seconds, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        d
      );
    }
    logSuccess(`Seeded ${displays.length} billboard displays`);
  } catch (err) {
    logError(`Billboard displays seed failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // 10. Seed Analytics
  // ------------------------------------------
  logStep('Seeding analytics...');
  try {
    const analytics = [
      [1, 1, '2026-03-01', 450, 3, 42.5, 5, 7.2],
      [1, 2, '2026-03-01', 380, 2, 38.1, 4, 6.8],
      [1, 1, '2026-03-02', 520, 4, 47.3, 6, 7.8],
      [1, 2, '2026-03-02', 410, 3, 41.2, 5, 7.1],
      [2, 3, '2026-03-01', 680, 5, 52.8, 7, 8.1],
      [2, 14, '2026-03-01', 320, 2, 35.6, 3, 6.5],
      [2, 3, '2026-03-02', 720, 6, 55.4, 8, 8.4],
      [4, 1, '2026-03-01', 290, 2, 31.4, 3, 6.2],
      [4, 2, '2026-03-01', 340, 3, 36.7, 4, 6.9],
      [4, 1, '2026-03-02', 310, 3, 33.8, 4, 6.5],
      [5, 4, '2026-03-01', 410, 3, 39.2, 5, 7.0],
      [5, 14, '2026-03-01', 360, 2, 34.5, 3, 6.6],
      [6, 7, '2026-03-01', 550, 4, 44.1, 6, 7.5],
      [6, 9, '2026-03-01', 480, 3, 40.3, 5, 7.3],
      [7, 13, '2026-03-01', 620, 4, 48.7, 6, 7.9],
      [7, 10, '2026-03-01', 390, 3, 37.8, 4, 6.8],
      [9, 11, '2026-03-01', 280, 2, 28.5, 3, 5.9],
      [10, 6, '2026-03-01', 350, 2, 32.1, 4, 6.4],
      [11, 14, '2026-03-01', 470, 4, 43.6, 5, 7.4],
      [11, 4, '2026-03-01', 520, 3, 46.2, 6, 7.6],
      [13, 9, '2026-03-01', 430, 3, 38.9, 5, 7.1],
      [14, 10, '2026-03-01', 310, 2, 29.4, 3, 6.0],
      [14, 15, '2026-03-01', 270, 2, 27.8, 3, 5.8],
      [15, 3, '2026-03-01', 580, 5, 50.3, 7, 8.0],
      [15, 13, '2026-03-01', 490, 4, 44.8, 5, 7.5],
      [1, 1, '2026-03-03', 560, 5, 49.1, 7, 8.0],
      [4, 2, '2026-03-03', 370, 3, 35.2, 4, 6.7],
      [6, 7, '2026-03-03', 600, 4, 46.5, 6, 7.7],
      [7, 13, '2026-03-03', 640, 5, 51.2, 7, 8.2],
      [13, 9, '2026-03-03', 460, 3, 40.7, 5, 7.2],
    ];
    for (const a of analytics) {
      await appPool.query(
        `INSERT INTO analytics (campaign_id, truck_id, date, impressions, neighborhoods_covered, miles_driven, headlines_generated, engagement_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        a
      );
    }
    logSuccess(`Seeded ${analytics.length} analytics entries`);
  } catch (err) {
    logError(`Analytics seed failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // 11. Seed Demographic Data
  // ------------------------------------------
  logStep('Seeding demographic data...');
  try {
    const demoData = [
      [1, 'housing', 'avg_rent', '$2,850', 'census_2025'],
      [1, 'food', 'top_restaurants', '47', 'yelp_api'],
      [1, 'walkability', 'walkability_score', '95', 'walkscore'],
      [1, 'recreation', 'park_count', '8', 'city_data'],
      [2, 'housing', 'avg_rent', '$2,200', 'census_2025'],
      [2, 'food', 'top_restaurants', '62', 'yelp_api'],
      [2, 'walkability', 'walkability_score', '78', 'walkscore'],
      [2, 'recreation', 'park_count', '5', 'city_data'],
      [3, 'housing', 'avg_rent', '$1,950', 'census_2025'],
      [3, 'food', 'top_restaurants', '55', 'yelp_api'],
      [3, 'walkability', 'walkability_score', '92', 'walkscore'],
      [3, 'education', 'school_rating', '8.2', 'greatschools'],
      [4, 'housing', 'avg_rent', '$3,800', 'census_2025'],
      [4, 'food', 'top_restaurants', '120', 'yelp_api'],
      [4, 'walkability', 'walkability_score', '99', 'walkscore'],
      [4, 'recreation', 'park_count', '3', 'city_data'],
      [5, 'housing', 'avg_rent', '$4,500', 'census_2025'],
      [5, 'food', 'top_restaurants', '35', 'yelp_api'],
      [5, 'education', 'school_rating', '9.1', 'greatschools'],
      [5, 'recreation', 'park_count', '12', 'city_data'],
      [6, 'housing', 'avg_rent', '$2,100', 'census_2025'],
      [6, 'food', 'top_restaurants', '78', 'yelp_api'],
      [6, 'walkability', 'walkability_score', '82', 'walkscore'],
      [6, 'recreation', 'park_count', '6', 'city_data'],
      [7, 'housing', 'avg_rent', '$3,500', 'census_2025'],
      [7, 'food', 'top_restaurants', '95', 'yelp_api'],
      [7, 'walkability', 'walkability_score', '97', 'walkscore'],
      [7, 'recreation', 'park_count', '2', 'city_data'],
      [8, 'housing', 'avg_rent', '$1,800', 'census_2025'],
      [8, 'food', 'top_restaurants', '83', 'yelp_api'],
      [8, 'walkability', 'walkability_score', '88', 'walkscore'],
      [8, 'entertainment', 'nightlife_venues', '45', 'yelp_api'],
      [9, 'housing', 'avg_rent', '$2,400', 'census_2025'],
      [9, 'education', 'school_rating', '8.7', 'greatschools'],
      [9, 'walkability', 'walkability_score', '90', 'walkscore'],
      [9, 'recreation', 'park_count', '15', 'city_data'],
      [10, 'housing', 'avg_rent', '$1,650', 'census_2025'],
      [10, 'food', 'top_restaurants', '72', 'yelp_api'],
      [10, 'entertainment', 'nightlife_venues', '38', 'yelp_api'],
      [10, 'walkability', 'walkability_score', '85', 'walkscore'],
    ];
    for (const d of demoData) {
      await appPool.query(
        `INSERT INTO demographic_data (neighborhood_id, category, metric_name, metric_value, data_source)
         VALUES ($1, $2, $3, $4, $5)`,
        d
      );
    }
    logSuccess(`Seeded ${demoData.length} demographic data entries`);
  } catch (err) {
    logError(`Demographic data seed failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // 12. Seed AI Generation Logs
  // ------------------------------------------
  logStep('Seeding AI generation logs...');
  try {
    const aiLogs = [
      ['Generate a witty headline for a moving company targeting young professionals in Williamsburg, Brooklyn. The audience loves craft coffee, vintage shopping, and tech startups.', JSON.stringify({ headline: 'Moving to Brooklyn? We Make It Effortless.', alternatives: ['Your Williamsburg Move, Stress-Free.', 'Brooklyn Bound? Start Packing Dreams.'], confidence: 0.92 }), 'gpt-4', 245, 1820, 1, 'Williamsburg', 1],
      ['Create a bold fitness ad for Venice Beach targeting health-conscious millennials who enjoy surfing and outdoor workouts.', JSON.stringify({ headline: 'Venice Beach Gets Fit with FlexGym', alternatives: ['Train Like a Local. Venice Beach Strong.', 'Sun. Sand. Sweat. FlexGym Venice.'], confidence: 0.88 }), 'gpt-4', 198, 1540, 7, 'Venice Beach', 6],
      ['Write a professional headline for luxury electric vehicles targeting high-net-worth individuals in SoHo, NYC.', JSON.stringify({ headline: 'Drive Electric. Drive SoHo.', alternatives: ['The Future of Luxury is Electric.', 'Prestige EV: SoHo Approved.'], confidence: 0.95 }), 'gpt-4', 210, 1670, 13, 'SoHo', 7],
      ['Generate a casual back-to-school headline for parents in Park Slope, Brooklyn. Focus on family-oriented messaging.', JSON.stringify({ headline: 'Park Slope Parents: School Ready?', alternatives: ['A+ Starts in Park Slope.', 'Everything Your Kid Needs.'], confidence: 0.89 }), 'gpt-4', 178, 1390, 14, 'Park Slope', 2],
      ['Create a fun craft beer headline for Wicker Park, Chicago nightlife audience.', JSON.stringify({ headline: 'Cheers to Wicker Park Craft Brews', alternatives: ['Every Sip Tells a Story.', 'Craft. Local. Wicker Park.'], confidence: 0.91 }), 'gpt-4', 165, 1280, 9, 'Wicker Park', 13],
      ['Write a calming spa wellness headline for Old Town Scottsdale targeting retirees and tourists.', JSON.stringify({ headline: 'Relax. Renew. Scottsdale Style.', alternatives: ['Desert Serenity Awaits.', 'Your Escape is Here.'], confidence: 0.93 }), 'gpt-4', 156, 1210, 6, 'Old Town Scottsdale', 10],
      ['Generate a youthful student deals headline for Tempe, AZ targeting ASU college students.', JSON.stringify({ headline: 'Tempe Students: Deals You Actually Want', alternatives: ['ASU Approved. Wallet Friendly.', 'Student Life Just Got Better.'], confidence: 0.87 }), 'gpt-4', 189, 1450, 11, 'Tempe', 9],
      ['Create an aspirational real estate headline for Lincoln Park, Chicago young families.', JSON.stringify({ headline: 'Your Dream Home in Lincoln Park Awaits', alternatives: ['Find Your Perfect Home.', 'Spring Into Your New Home.'], confidence: 0.90 }), 'gpt-4', 201, 1580, 14, 'Lincoln Park', 11],
      ['Write a playful pet-friendly headline for the Heights neighborhood in Houston.', JSON.stringify({ headline: 'Houston Heights: A Dog Walker Paradise', alternatives: ['Paws Up, Heights!', 'Every Pet Deserves the Heights Life.'], confidence: 0.86 }), 'gpt-4', 172, 1340, 10, 'Heights', 14],
      ['Generate an authoritative financial services headline for Midtown Manhattan professionals.', JSON.stringify({ headline: 'Smart Money Moves in Manhattan', alternatives: ['Manhattan Trusts WealthPath.', 'Your Financial Future Starts Here.'], confidence: 0.94 }), 'gpt-4', 223, 1750, 3, 'Midtown Manhattan', 15],
      ['Create a tech-forward headline for cloud services targeting Silver Lake startups.', JSON.stringify({ headline: 'LA Tech Runs on CloudServe', alternatives: ['Code. Deploy. Scale.', 'Silver Lake Innovators Choose CloudServe.'], confidence: 0.88 }), 'gpt-4', 195, 1520, 2, 'Silver Lake', 4],
      ['Write an exciting arts event headline for SoHo, NYC art enthusiasts.', JSON.stringify({ headline: 'SoHo Art Walk: This Weekend Only', alternatives: ['Art Lives in SoHo.', 'Streets Become Galleries.'], confidence: 0.91 }), 'gpt-4', 167, 1310, 7, 'SoHo', 12],
      ['Generate a confident headline for a moving company in Silver Lake targeting creative professionals.', JSON.stringify({ headline: 'Silver Lake Movers: Start Fresh, Live Bold', alternatives: ['New Pad? We Got You.', 'Move Like a Local.'], confidence: 0.90 }), 'gpt-4', 182, 1420, 2, 'Silver Lake', 1],
      ['Create a festive holiday headline for luxury gifts in Midtown Manhattan.', JSON.stringify({ headline: 'Holiday Magic in Times Square', alternatives: ['Give the Gift of NYC.', 'Unwrap Something Special.'], confidence: 0.96 }), 'gpt-4', 231, 1810, 3, 'Midtown Manhattan', 3],
      ['Write a community-focused fitness headline for Wicker Park, Chicago.', JSON.stringify({ headline: 'Wicker Park: Where Fitness Meets Community', alternatives: ['Get Fit with Your Neighbors.', 'Join the Movement.'], confidence: 0.85 }), 'gpt-4', 174, 1360, 9, 'Wicker Park', 6],
    ];
    for (const l of aiLogs) {
      await appPool.query(
        `INSERT INTO ai_generation_logs (prompt, response, model, tokens_used, latency_ms, truck_id, neighborhood, campaign_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        l
      );
    }
    logSuccess(`Seeded ${aiLogs.length} AI generation logs`);
  } catch (err) {
    logError(`AI generation logs seed failed: ${err.message}`);
    throw err;
  }

  // ------------------------------------------
  // Summary
  // ------------------------------------------
  logTitle('Seed Summary');
  try {
    const tables = [
      'users', 'trucks', 'gps_locations', 'neighborhoods', 'campaigns',
      'headlines', 'billboard_displays', 'analytics', 'demographic_data', 'ai_generation_logs',
    ];
    for (const table of tables) {
      const res = await appPool.query(`SELECT COUNT(*) FROM ${table}`);
      const count = res.rows[0].count;
      console.log(`  ${c.green}${table.padEnd(22)}${c.reset} ${c.bold}${count}${c.reset} rows`);
    }
    console.log(`\n${c.green}${c.bold}Database seeded successfully!${c.reset}\n`);
  } catch (err) {
    logError(`Summary query failed: ${err.message}`);
  }

  await appPool.end();
}

// ============================================
// Run
// ============================================
seed().catch((err) => {
  logError(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
