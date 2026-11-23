// Business type definitions. Money in base-year dollars (scaled by the economy's price level).
// model: retail | membership | hotel | agency | factory
// curve: 24 hourly demand weights (0-1), used while open.

const C = {
  morning: [0, 0, 0, 0, 0, 0.15, 0.55, 1, 0.95, 0.7, 0.55, 0.6, 0.75, 0.6, 0.45, 0.4, 0.38, 0.32, 0.25, 0.15, 0.08, 0.04, 0, 0],
  meals: [0, 0, 0, 0, 0, 0, 0.05, 0.12, 0.18, 0.2, 0.3, 0.7, 1, 0.85, 0.4, 0.3, 0.35, 0.6, 0.95, 1, 0.8, 0.5, 0.25, 0.08],
  retail: [0, 0, 0, 0, 0, 0, 0.05, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 0.85, 0.8, 0.8, 0.85, 0.95, 1, 0.85, 0.6, 0.35, 0.15, 0.05],
  grocery: [0.05, 0.03, 0.02, 0.02, 0.03, 0.08, 0.25, 0.5, 0.55, 0.5, 0.5, 0.6, 0.75, 0.65, 0.55, 0.6, 0.8, 1, 0.95, 0.75, 0.5, 0.3, 0.15, 0.08],
  night: [0.55, 0.45, 0.25, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.05, 0.05, 0.08, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1, 0.85],
  gym: [0.05, 0, 0, 0, 0.05, 0.4, 0.85, 0.9, 0.6, 0.4, 0.35, 0.45, 0.6, 0.45, 0.3, 0.35, 0.55, 0.95, 1, 0.8, 0.55, 0.35, 0.15, 0.05],
};

export const SUPPLIER_TIERS = [
  { id: 'budget', name: 'ValuMart Wholesale', costMul: 0.84, quality: 34, lead: 1, reliability: 0.9, desc: 'Cheapest. Inconsistent quality, occasional missed deliveries.' },
  { id: 'standard', name: 'Meridian Food & Supply', costMul: 1.0, quality: 60, lead: 1, reliability: 0.97, desc: 'Solid mid-market distributor.' },
  { id: 'premium', name: 'Artisan Collective', costMul: 1.36, quality: 86, lead: 2, reliability: 0.95, desc: 'Top-shelf goods; customers taste the difference.' },
];

export const BUSINESS_TYPES = {
  cafe: {
    id: 'cafe', name: 'Coffee Shop', icon: '☕', category: 'Food & Beverage', model: 'retail', unitTypes: ['retail'], minArea: 45,
    permits: ['food_service', 'health_cert'], hours: [6, 20], fitoutPerM2: 260, fitoutDays: 3, commodity: 'coffee',
    equipment: [{ tier: 'Basic', cost: 16000, quality: 40, capacity: 0.85 }, { tier: 'Professional', cost: 42000, quality: 63, capacity: 1.0 }, { tier: 'Premium', cost: 98000, quality: 86, capacity: 1.2 }],
    products: [
      { id: 'espresso', name: 'Espresso Drinks', unitCost: 0.95, refPrice: 4.75, share: 0.42, elasticity: 1.3, shelf: 30 },
      { id: 'drip', name: 'Brewed Coffee & Tea', unitCost: 0.42, refPrice: 2.95, share: 0.22, elasticity: 1.6, shelf: 30 },
      { id: 'pastry', name: 'Pastries', unitCost: 1.15, refPrice: 3.95, share: 0.22, elasticity: 1.2, shelf: 2 },
      { id: 'sandwich', name: 'Sandwiches & Salads', unitCost: 2.95, refPrice: 8.95, share: 0.14, elasticity: 1.1, shelf: 3 },
    ],
    itemsPerCustomer: 1.55, capture: 0.05, curve: C.morning, seatsPerM2: 0.35, utilitiesPerM2: 6.5, insurance: 180, valuation: 2.8,
    roles: [{ id: 'barista', name: 'Barista', wage: 17, serves: 22, required: true }, { id: 'manager', name: 'Shift Manager', wage: 25, serves: 8, manager: true }],
    blurb: 'High-volume, low-ticket. Thrives on morning commuters and office workers.',
  },
  bakery: {
    id: 'bakery', name: 'Artisan Bakery', icon: '🥐', category: 'Food & Beverage', model: 'retail', unitTypes: ['retail'], minArea: 55,
    permits: ['food_service', 'health_cert'], hours: [6, 18], fitoutPerM2: 240, fitoutDays: 3, commodity: 'food',
    equipment: [{ tier: 'Basic', cost: 22000, quality: 42, capacity: 0.85 }, { tier: 'Professional', cost: 55000, quality: 64, capacity: 1.0 }, { tier: 'Premium', cost: 120000, quality: 87, capacity: 1.2 }],
    products: [
      { id: 'bread', name: 'Sourdough & Loaves', unitCost: 1.6, refPrice: 6.5, share: 0.35, elasticity: 1.1, shelf: 2 },
      { id: 'viennoiserie', name: 'Croissants & Viennoiserie', unitCost: 0.9, refPrice: 3.75, share: 0.35, elasticity: 1.3, shelf: 1 },
      { id: 'cakes', name: 'Cakes & Tarts', unitCost: 3.8, refPrice: 14.0, share: 0.15, elasticity: 1.0, shelf: 3 },
      { id: 'coffee', name: 'Coffee', unitCost: 0.5, refPrice: 3.0, share: 0.15, elasticity: 1.5, shelf: 30 },
    ],
    itemsPerCustomer: 2.1, capture: 0.042, curve: C.morning, seatsPerM2: 0.2, utilitiesPerM2: 8, insurance: 170, valuation: 2.6,
    roles: [{ id: 'baker', name: 'Baker', wage: 20, serves: 26, required: true }, { id: 'clerk', name: 'Counter Clerk', wage: 16, serves: 30 }, { id: 'manager', name: 'Store Manager', wage: 26, serves: 6, manager: true }],
    blurb: 'Early mornings and loyal regulars. Very perishable stock — watch your waste.',
  },
  restaurant: {
    id: 'restaurant', name: 'Restaurant', icon: '🍽️', category: 'Food & Beverage', model: 'retail', unitTypes: ['retail'], minArea: 110,
    permits: ['food_service', 'health_cert'], hours: [11, 23], fitoutPerM2: 400, fitoutDays: 6, commodity: 'food',
    equipment: [{ tier: 'Basic', cost: 45000, quality: 42, capacity: 0.85 }, { tier: 'Professional', cost: 115000, quality: 65, capacity: 1.0 }, { tier: 'Premium', cost: 260000, quality: 88, capacity: 1.15 }],
    products: [
      { id: 'starters', name: 'Starters', unitCost: 3.2, refPrice: 12, share: 0.22, elasticity: 1.1, shelf: 2 },
      { id: 'mains', name: 'Main Courses', unitCost: 7.5, refPrice: 26, share: 0.4, elasticity: 1.0, shelf: 2 },
      { id: 'desserts', name: 'Desserts', unitCost: 2.4, refPrice: 10, share: 0.13, elasticity: 1.2, shelf: 3 },
      { id: 'drinks', name: 'Beverages', unitCost: 1.3, refPrice: 6.5, share: 0.25, elasticity: 1.2, shelf: 30 },
    ],
    itemsPerCustomer: 2.4, capture: 0.022, curve: C.meals, seatsPerM2: 0.5, utilitiesPerM2: 9, insurance: 360, valuation: 2.4,
    roles: [{ id: 'chef', name: 'Head Chef', wage: 30, serves: 14, required: true, max: 1 }, { id: 'cook', name: 'Line Cook', wage: 19, serves: 13 }, { id: 'server', name: 'Server', wage: 13, serves: 16, required: true }, { id: 'manager', name: 'General Manager', wage: 32, serves: 4, manager: true }],
    blurb: 'Big tickets, big kitchens, tight margins. Lunch and dinner rushes.',
  },
  bar: {
    id: 'bar', name: 'Cocktail Bar', icon: '🍸', category: 'Nightlife', model: 'retail', unitTypes: ['retail'], minArea: 80,
    permits: ['food_service', 'liquor'], hours: [17, 2], fitoutPerM2: 350, fitoutDays: 4, commodity: 'food',
    equipment: [{ tier: 'Basic', cost: 28000, quality: 42, capacity: 0.85 }, { tier: 'Professional', cost: 70000, quality: 65, capacity: 1.0 }, { tier: 'Premium', cost: 165000, quality: 88, capacity: 1.2 }],
    products: [
      { id: 'beer', name: 'Draft & Craft Beer', unitCost: 1.5, refPrice: 8, share: 0.38, elasticity: 1.2, shelf: 60 },
      { id: 'cocktails', name: 'Cocktails', unitCost: 2.8, refPrice: 15, share: 0.34, elasticity: 1.0, shelf: 60 },
      { id: 'wine', name: 'Wine', unitCost: 3.0, refPrice: 13, share: 0.18, elasticity: 1.0, shelf: 120 },
      { id: 'snacks', name: 'Bar Snacks', unitCost: 2.2, refPrice: 9, share: 0.1, elasticity: 1.3, shelf: 3 },
    ],
    itemsPerCustomer: 2.6, capture: 0.03, curve: C.night, seatsPerM2: 0.6, utilitiesPerM2: 7, insurance: 420, valuation: 2.5,
    roles: [{ id: 'bartender', name: 'Bartender', wage: 15, serves: 28, required: true }, { id: 'security', name: 'Door Security', wage: 21, serves: 0 }, { id: 'manager', name: 'Bar Manager', wage: 28, serves: 6, manager: true }],
    blurb: 'Excellent margins on drinks. Needs a liquor license (14 days, expensive).',
  },
  boutique: {
    id: 'boutique', name: 'Fashion Boutique', icon: '👗', category: 'Retail', model: 'retail', unitTypes: ['retail'], minArea: 60,
    permits: [], hours: [10, 21], fitoutPerM2: 320, fitoutDays: 4, commodity: 'fabric',
    equipment: [{ tier: 'Basic', cost: 12000, quality: 40, capacity: 0.85 }, { tier: 'Professional', cost: 38000, quality: 63, capacity: 1.0 }, { tier: 'Premium', cost: 95000, quality: 86, capacity: 1.15 }],
    products: [
      { id: 'tops', name: 'Tops & Tees', unitCost: 14, refPrice: 32, share: 0.34, elasticity: 1.2, shelf: 365 },
      { id: 'denim', name: 'Denim & Trousers', unitCost: 34, refPrice: 75, share: 0.24, elasticity: 1.1, shelf: 365 },
      { id: 'outer', name: 'Outerwear', unitCost: 66, refPrice: 145, share: 0.14, elasticity: 1.0, shelf: 365 },
      { id: 'accessories', name: 'Accessories', unitCost: 11, refPrice: 28, share: 0.28, elasticity: 1.3, shelf: 365 },
    ],
    itemsPerCustomer: 1.6, capture: 0.0075, curve: C.retail, seatsPerM2: 0, utilitiesPerM2: 4.5, insurance: 150, valuation: 2.2,
    roles: [{ id: 'associate', name: 'Sales Associate', wage: 16, serves: 9, required: true }, { id: 'manager', name: 'Store Manager', wage: 27, serves: 4, manager: true }],
    blurb: 'High margins, slow-moving inventory and seasonal trends.',
  },
  grocery: {
    id: 'grocery', name: 'Grocery Market', icon: '🛒', category: 'Retail', model: 'retail', unitTypes: ['retail'], minArea: 120,
    permits: ['food_service'], hours: [7, 23], fitoutPerM2: 210, fitoutDays: 4, commodity: 'food',
    equipment: [{ tier: 'Basic', cost: 30000, quality: 40, capacity: 0.85 }, { tier: 'Professional', cost: 75000, quality: 62, capacity: 1.0 }, { tier: 'Premium', cost: 170000, quality: 84, capacity: 1.2 }],
    products: [
      { id: 'produce', name: 'Fresh Produce', unitCost: 1.6, refPrice: 2.9, share: 0.26, elasticity: 1.5, shelf: 5 },
      { id: 'dairy', name: 'Dairy & Bakery', unitCost: 2.0, refPrice: 3.6, share: 0.22, elasticity: 1.4, shelf: 7 },
      { id: 'pantry', name: 'Pantry Staples', unitCost: 2.4, refPrice: 3.9, share: 0.3, elasticity: 1.6, shelf: 180 },
      { id: 'household', name: 'Household & Beverages', unitCost: 3.1, refPrice: 5.2, share: 0.22, elasticity: 1.5, shelf: 365 },
    ],
    itemsPerCustomer: 7.5, capture: 0.03, curve: C.grocery, seatsPerM2: 0, utilitiesPerM2: 7.5, insurance: 260, valuation: 2.0,
    roles: [{ id: 'cashier', name: 'Cashier', wage: 15.5, serves: 26, required: true }, { id: 'stocker', name: 'Stock Clerk', wage: 15.5, serves: 14 }, { id: 'manager', name: 'Store Manager', wage: 28, serves: 6, manager: true }],
    blurb: 'Necessity spending: steady through recessions, razor-thin margins, huge volume.',
  },
  pharmacy: {
    id: 'pharmacy', name: 'Pharmacy', icon: '💊', category: 'Health', model: 'retail', unitTypes: ['retail'], minArea: 80,
    permits: ['pharmacy'], hours: [8, 21], fitoutPerM2: 300, fitoutDays: 5, commodity: 'pharma',
    equipment: [{ tier: 'Basic', cost: 26000, quality: 45, capacity: 0.9 }, { tier: 'Professional', cost: 62000, quality: 66, capacity: 1.0 }, { tier: 'Premium', cost: 135000, quality: 86, capacity: 1.15 }],
    products: [
      { id: 'rx', name: 'Prescriptions', unitCost: 22, refPrice: 35, share: 0.4, elasticity: 0.4, shelf: 365 },
      { id: 'otc', name: 'Over-the-Counter', unitCost: 4.5, refPrice: 9.5, share: 0.3, elasticity: 1.0, shelf: 365 },
      { id: 'beauty', name: 'Health & Beauty', unitCost: 5, refPrice: 13, share: 0.2, elasticity: 1.3, shelf: 365 },
      { id: 'snacks', name: 'Snacks & Drinks', unitCost: 1.1, refPrice: 2.8, share: 0.1, elasticity: 1.5, shelf: 120 },
    ],
    itemsPerCustomer: 1.9, capture: 0.017, curve: C.retail, seatsPerM2: 0, utilitiesPerM2: 5, insurance: 520, valuation: 3.0,
    roles: [{ id: 'pharmacist', name: 'Pharmacist', wage: 58, serves: 12, required: true }, { id: 'tech', name: 'Pharmacy Tech', wage: 19, serves: 14 }, { id: 'manager', name: 'Store Manager', wage: 30, serves: 4, manager: true }],
    blurb: 'Recession-proof demand and price-insensitive prescriptions. Pharmacists are expensive.',
  },
  gym: {
    id: 'gym', name: 'Fitness Club', icon: '🏋️', category: 'Services', model: 'membership', unitTypes: ['retail', 'industrial'], minArea: 250,
    permits: ['fitness'], hours: [5, 23], fitoutPerM2: 190, fitoutDays: 5, commodity: null,
    equipment: [{ tier: 'Basic', cost: 60000, quality: 40, capacity: 0.85 }, { tier: 'Professional', cost: 150000, quality: 65, capacity: 1.0 }, { tier: 'Premium', cost: 340000, quality: 88, capacity: 1.15 }],
    products: [
      { id: 'membership', name: 'Monthly Membership', unitCost: 0, refPrice: 55, share: 1, elasticity: 1.4, shelf: 0, service: true },
      { id: 'daypass', name: 'Day Pass', unitCost: 0, refPrice: 18, share: 1, elasticity: 1.3, shelf: 0, service: true },
      { id: 'pt', name: 'Personal Training (session)', unitCost: 0, refPrice: 75, share: 1, elasticity: 1.1, shelf: 0, service: true },
    ],
    capture: 0.0024, curve: C.gym, m2PerUser: 8, utilitiesPerM2: 6, insurance: 450, valuation: 3.2,
    roles: [{ id: 'desk', name: 'Front Desk', wage: 15.5, serves: 0, required: true }, { id: 'trainer', name: 'Personal Trainer', wage: 26, serves: 0 }, { id: 'manager', name: 'Club Manager', wage: 30, serves: 0, manager: true }],
    blurb: 'Recurring membership revenue. Churn is the enemy; January is your friend.',
  },
  hotel: {
    id: 'hotel', name: 'Boutique Hotel', icon: '🏨', category: 'Hospitality', model: 'hotel', unitTypes: ['building'], minArea: 1400,
    permits: ['hotel', 'food_service'], hours: [0, 24], fitoutPerM2: 320, fitoutDays: 12, commodity: null,
    equipment: [{ tier: '3-Star', cost: 350000, quality: 50, capacity: 1.0 }, { tier: '4-Star', cost: 900000, quality: 70, capacity: 1.0 }, { tier: '5-Star Luxury', cost: 2400000, quality: 90, capacity: 1.0 }],
    products: [{ id: 'room', name: 'Average Room Rate', unitCost: 34, refPrice: 190, share: 1, elasticity: 1.2, shelf: 0, service: true }],
    capture: 1, curve: C.retail, m2PerRoom: 34, utilitiesPerM2: 3.5, insurance: 2400, valuation: 4.5,
    roles: [{ id: 'reception', name: 'Receptionist', wage: 18, serves: 0, required: true }, { id: 'housekeeper', name: 'Housekeeper', wage: 16.5, serves: 14, required: true }, { id: 'concierge', name: 'Concierge', wage: 22, serves: 0 }, { id: 'manager', name: 'Hotel Manager', wage: 42, serves: 0, manager: true }],
    blurb: 'Capital-hungry, but tourists pay premium nightly rates. Buy or lease a whole building.',
  },
  tech: {
    id: 'tech', name: 'Software Studio', icon: '💻', category: 'Professional Services', model: 'agency', unitTypes: ['office'], minArea: 120,
    permits: [], hours: [9, 18], fitoutPerM2: 160, fitoutDays: 3, commodity: null,
    equipment: [{ tier: 'Startup', cost: 18000, quality: 45, capacity: 0.9 }, { tier: 'Professional', cost: 52000, quality: 66, capacity: 1.0 }, { tier: 'Enterprise', cost: 140000, quality: 86, capacity: 1.15 }],
    products: [{ id: 'rate', name: 'Billable Rate (per hour)', unitCost: 0, refPrice: 145, share: 1, elasticity: 1.0, shelf: 0, service: true }],
    capture: 1, curve: C.retail, utilitiesPerM2: 4, insurance: 380, valuation: 4.0,
    roles: [{ id: 'engineer', name: 'Software Engineer', wage: 62, serves: 0, required: true, productive: true }, { id: 'designer', name: 'Product Designer', wage: 46, serves: 0, productive: true }, { id: 'sales', name: 'Account Executive', wage: 38, serves: 0, sales: true }, { id: 'manager', name: 'Project Manager', wage: 55, serves: 0, manager: true }],
    blurb: 'Win client contracts and deliver them on time. Talent is everything.',
  },
  logistics: {
    id: 'logistics', name: 'Freight & Logistics', icon: '🚚', category: 'Industrial', model: 'agency', unitTypes: ['industrial'], minArea: 600,
    permits: ['transport'], hours: [6, 22], fitoutPerM2: 60, fitoutDays: 3, commodity: 'fuel', vehicles: true,
    equipment: [{ tier: 'Basic Depot', cost: 25000, quality: 45, capacity: 0.9 }, { tier: 'Automated Depot', cost: 90000, quality: 66, capacity: 1.05 }, { tier: 'Smart Hub', cost: 240000, quality: 86, capacity: 1.2 }],
    products: [{ id: 'rate', name: 'Freight Rate (per truck-hour)', unitCost: 0, refPrice: 115, share: 1, elasticity: 1.0, shelf: 0, service: true }],
    capture: 1, curve: C.retail, utilitiesPerM2: 2, insurance: 900, valuation: 3.4,
    roles: [{ id: 'driver', name: 'Truck Driver', wage: 26, serves: 0, required: true, productive: true }, { id: 'dispatcher', name: 'Dispatcher', wage: 27, serves: 0, sales: true }, { id: 'manager', name: 'Operations Manager', wage: 40, serves: 0, manager: true }],
    blurb: 'B2B freight contracts. Buy trucks, hire drivers, watch fuel prices.',
  },
  factory: {
    id: 'factory', name: 'Manufacturing Plant', icon: '🏭', category: 'Industrial', model: 'factory', unitTypes: ['industrial'], minArea: 800,
    permits: ['industrial'], hours: [6, 22], fitoutPerM2: 90, fitoutDays: 8, commodity: null,
    equipment: [{ tier: 'Manual Line', cost: 120000, quality: 45, capacity: 0.8 }, { tier: 'Semi-Automated', cost: 380000, quality: 66, capacity: 1.0 }, { tier: 'Robotic Line', cost: 950000, quality: 88, capacity: 1.5 }],
    products: [],
    capture: 1, curve: C.retail, utilitiesPerM2: 5, insurance: 1600, valuation: 3.0,
    roles: [{ id: 'operator', name: 'Machine Operator', wage: 22, serves: 0, required: true, productive: true }, { id: 'qa', name: 'QA Technician', wage: 27, serves: 0 }, { id: 'manager', name: 'Plant Manager', wage: 45, serves: 0, manager: true }],
    blurb: 'Turn raw materials into goods. Sell wholesale or supply your own stores at cost.',
  },
};

// Factory product lines. Output can supply your own stores of `feeds` types.
export const FACTORY_LINES = {
  coffee: { id: 'coffee', name: 'Coffee Roastery', raw: 'Green coffee', rawCost: 4.2, output: 'Roasted coffee (kg)', price: 13.5, perWorkerHour: 11, commodity: 'coffee', feeds: ['cafe', 'bakery'], marketDepth: 900 },
  bakery: { id: 'bakery', name: 'Industrial Bakery & Foods', raw: 'Flour, dairy & produce', rawCost: 1.3, output: 'Packaged foods (case)', price: 3.4, perWorkerHour: 32, commodity: 'food', feeds: ['restaurant', 'grocery', 'bar'], marketDepth: 4200 },
  apparel: { id: 'apparel', name: 'Apparel Factory', raw: 'Fabric & trims', rawCost: 6.8, output: 'Garments', price: 17.5, perWorkerHour: 6, commodity: 'fabric', feeds: ['boutique'], marketDepth: 1100 },
  electronics: { id: 'electronics', name: 'Electronics Assembly', raw: 'Components', rawCost: 21, output: 'Devices', price: 48, perWorkerHour: 2.4, commodity: 'electronics', feeds: [], marketDepth: 420 },
};

export const UPGRADES = {
  renovation: { id: 'renovation', name: 'Interior Renovation', desc: 'Raises ambiance (+8% appeal per level). Max level 3.', perM2: 210, levels: 3, applies: 'all' },
  pos: { id: 'pos', name: 'Modern POS System', desc: '+6% service capacity, live sales analytics.', cost: 4200, applies: ['retail'] },
  signage: { id: 'signage', name: 'Illuminated Signage', desc: '+25% awareness growth from walk-by traffic.', cost: 7500, applies: ['retail', 'membership', 'hotel'] },
  security: { id: 'security', name: 'Security System', desc: 'Cameras & alarms. Cuts theft/burglary risk by 80%.', cost: 5200, applies: 'all' },
  loyalty: { id: 'loyalty', name: 'Loyalty Program', desc: '+5% repeat demand, reputation decays slower. Costs 1% of revenue.', cost: 2500, applies: ['retail', 'membership', 'hotel'] },
  delivery: { id: 'delivery', name: 'Delivery App Partnership', desc: '+14% demand from app orders, 20% commission on those orders.', cost: 0, applies: ['cafe', 'bakery', 'restaurant', 'grocery', 'pharmacy'] },
  patio: { id: 'patio', name: 'Outdoor Seating', desc: '+15% capacity in good weather. Needs a sidewalk permit.', cost: 9000, applies: ['cafe', 'restaurant', 'bar', 'bakery'] },
  solar: { id: 'solar', name: 'Solar & Efficiency Retrofit', desc: '-35% utility bills.', perM2: 95, applies: 'all' },
  crm: { id: 'crm', name: 'CRM & Sales Automation', desc: '+30% inbound contract leads.', cost: 12000, applies: ['agency'] },
  automation: { id: 'automation', name: 'Process Automation', desc: '+15% output per worker.', cost: 85000, applies: ['factory', 'agency'] },
};

export const MARKETING = [
  { id: 'flyers', name: 'Street Flyers', cost: 450, days: 7, power: 0.035, scope: 'local', desc: 'Cheap, local, short-lived.' },
  { id: 'social', name: 'Social Media Ads', cost: 1400, days: 10, power: 0.05, scope: 'local', desc: 'Targeted reach for younger customers.' },
  { id: 'influencer', name: 'Influencer Collab', cost: 3200, days: 7, power: 0.09, scope: 'local', random: true, desc: 'High variance. Could go viral... or flop.' },
  { id: 'radio', name: 'Local Radio Spot', cost: 6500, days: 14, power: 0.06, scope: 'city', desc: 'Reaches all of your businesses.' },
  { id: 'billboard', name: 'Billboard (30 days)', cost: 12000, days: 30, power: 0.055, scope: 'local', desc: 'Sustained awareness boost for one location.' },
  { id: 'tv', name: 'TV Campaign', cost: 48000, days: 21, power: 0.11, scope: 'city', desc: 'City-wide brand building for every business you own.' },
  { id: 'opening', name: 'Grand Opening Event', cost: 3500, days: 1, power: 0.25, scope: 'local', instant: true, desc: 'One-off launch party. Best right after opening.' },
  { id: 'b2b', name: 'Trade Show Booth', cost: 9500, days: 14, power: 0.08, scope: 'local', b2b: true, desc: 'For B2B companies: more and bigger contract leads.' },
];

export const PERMITS = {
  business_license: { id: 'business_license', name: 'General Business License', fee: 250, days: 0, annual: true, desc: 'Required for any business. Renews yearly.' },
  food_service: { id: 'food_service', name: 'Food Service Permit', fee: 650, days: 2, perLocation: true, desc: 'Selling food or drink to the public.' },
  health_cert: { id: 'health_cert', name: 'Health Department Certificate', fee: 320, days: 1, perLocation: true, desc: 'Passed pre-opening health inspection.' },
  liquor: { id: 'liquor', name: 'Liquor License', fee: 14500, days: 14, perLocation: true, desc: 'Serving alcohol. Slow and expensive.' },
  pharmacy: { id: 'pharmacy', name: 'State Pharmacy License', fee: 5200, days: 7, perLocation: true, desc: 'Dispensing prescription medication.' },
  fitness: { id: 'fitness', name: 'Fitness Facility Permit', fee: 480, days: 2, perLocation: true, desc: 'Occupancy & safety certification for gyms.' },
  hotel: { id: 'hotel', name: 'Lodging License', fee: 3800, days: 6, perLocation: true, desc: 'Operating short-term accommodation.' },
  transport: { id: 'transport', name: 'Commercial Carrier License', fee: 1600, days: 3, perLocation: false, desc: 'Operating commercial freight vehicles.' },
  industrial: { id: 'industrial', name: 'Industrial Operating Permit', fee: 2900, days: 4, perLocation: true, desc: 'Environmental and safety approval for manufacturing.' },
  sidewalk: { id: 'sidewalk', name: 'Sidewalk Café Permit', fee: 900, days: 2, perLocation: true, desc: 'Outdoor seating on public sidewalks.' },
};

export const ENTITY_TYPES = {
  sole: { id: 'sole', name: 'Sole Proprietorship', fee: 75, annual: 0, tax: 0.3, liability: 'Unlimited personal liability', credit: 0, desc: 'Cheapest and simplest. You and the business are one — lawsuits can reach your personal assets. Profits taxed at your personal rate plus self-employment tax (~30%).' },
  llc: { id: 'llc', name: 'Limited Liability Company (LLC)', fee: 850, annual: 350, tax: 0.26, liability: 'Limited liability', credit: 10, desc: 'Protects personal assets. Pass-through taxation (~26%). Banks take you a bit more seriously.' },
  corp: { id: 'corp', name: 'C-Corporation', fee: 2200, annual: 900, tax: 0.21, liability: 'Limited liability', credit: 25, ipo: true, desc: '21% corporate tax, can issue shares to investors and is the only structure that can IPO. Higher compliance costs.' },
};

export const TAX = { sales: 0.0825, payroll: 0.0765, property: 0.012 };
