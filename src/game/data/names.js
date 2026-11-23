// Name pools for procedurally generated people, companies and flavour text.
export const FIRST = ['Ava', 'Liam', 'Maya', 'Noah', 'Zoe', 'Ethan', 'Priya', 'Mateo', 'Chloe', 'Omar', 'Hana', 'Lucas', 'Grace', 'Diego', 'Aisha', 'Ben', 'Sofia', 'Kai', 'Elena', 'Marcus', 'Nina', 'Jamal', 'Iris', 'Theo', 'Leila', 'Owen', 'Mei', 'Samuel', 'Rosa', 'Felix', 'Amara', 'Jonah', 'Yuki', 'Caleb', 'Freya', 'Andre', 'Lucia', 'Ravi', 'Clara', 'Tomas', 'Imani', 'Victor', 'Ingrid', 'Malik', 'Paige', 'Hugo', 'Talia', 'Nolan', 'Esme', 'Dev'];
export const LAST = ['Chen', 'Okafor', 'Rivera', 'Novak', 'Patel', 'Kowalski', 'Haddad', 'Johansson', 'Nguyen', 'Brooks', 'Moreau', 'Silva', 'Tanaka', 'Mensah', 'Fischer', 'Romano', 'Ahmed', 'Walsh', 'Kim', 'Dubois', 'Costa', 'Lindqvist', 'Reyes', 'Becker', 'Osei', 'Park', 'Hughes', 'Ivanova', 'Santos', 'Murphy', 'Adeyemi', 'Larsen', 'Mbeki', 'Ortiz', 'Shah', 'Bianchi', 'Grant', 'Yilmaz', 'Hale', 'Varga'];

export const TRAITS = [
  { id: 'reliable', name: 'Reliable', desc: 'Rarely calls in sick; morale steadier.', good: true },
  { id: 'fast', name: 'Fast Learner', desc: 'Gains skill 60% faster.', good: true },
  { id: 'charming', name: 'Charismatic', desc: 'Customers love them (+satisfaction).', good: true },
  { id: 'hustler', name: 'Hustler', desc: '+10% productivity, wants raises.', good: true },
  { id: 'leader', name: 'Natural Leader', desc: 'Boosts team morale.', good: true },
  { id: 'lazy', name: 'Unmotivated', desc: '-12% productivity.', good: false },
  { id: 'flaky', name: 'Flaky', desc: 'Morale swings; may quit suddenly.', good: false },
  { id: 'grumpy', name: 'Grumpy', desc: 'Customers notice (-satisfaction).', good: false },
];

export const NAME_PARTS = {
  cafe: { a: ['Daily', 'Copper', 'Harbor', 'Little', 'Golden', 'Third', 'Morning', 'Ritual', 'Blue', 'North'], b: ['Grind', 'Bean', 'Roast', 'Cup', 'Kettle', 'Brew', 'Press', 'Crema', 'Drip', 'Espresso Bar'] },
  bakery: { a: ['Rising', 'Golden', 'Hearth', 'Flour', 'Butter', 'Old Town', 'Crumb', 'Sunday', 'Rye', 'Sweet'], b: ['Bakehouse', 'Loaf', 'Crust', 'Patisserie', 'Oven', 'Bakery', 'Boulangerie', 'Bread Co.'] },
  restaurant: { a: ['Saffron', 'Olive', 'Ember', 'The Copper', 'Salt &', 'Wild', 'Iron', 'Mercato', 'Lantern', 'Sea'], b: ['Table', 'Kitchen', 'Bistro', 'Grill', 'Pepper', 'House', 'Brasserie', 'Trattoria', 'Oyster Bar'] },
  bar: { a: ['Velvet', 'Neon', 'The Rusty', 'Midnight', 'Gilded', 'Smoke &', 'Copper', 'Last', 'Low', 'Blue'], b: ['Room', 'Anchor', 'Lounge', 'Mirrors', 'Owl', 'Call', 'Tide', 'Speakeasy', 'Social'] },
  boutique: { a: ['Atelier', 'Thread', 'Maison', 'Studio', 'Loom', 'Common', 'Vanta', 'Silk', 'Indigo', 'Rêve'], b: ['& Co.', 'Collective', 'Supply', 'Wardrobe', 'Label', 'House', 'Goods', 'Edit'] },
  grocery: { a: ['Fresh', 'Corner', 'Green', 'Market', 'Harvest', 'Union', 'Main St', 'Family', 'Pantry', 'Good'], b: ['Market', 'Grocer', 'Foods', 'Mart', 'Provisions', 'Fresh', 'Larder'] },
  pharmacy: { a: ['Care', 'Well', 'City', 'Vital', 'Green Cross', 'Meridian', 'Family', 'Health'], b: ['Pharmacy', 'Rx', 'Drugs', 'Apothecary', 'Chemist', 'Health'] },
  gym: { a: ['Iron', 'Peak', 'Pulse', 'Forge', 'Core', 'Titan', 'Kinetic', 'Summit', 'Elevate'], b: ['Fitness', 'Gym', 'Athletic Club', 'Strength', 'Performance', 'Lab'] },
  hotel: { a: ['The Meridian', 'Harbor', 'Grand', 'Lumen', 'The Archer', 'Waterline', 'Crown', 'Aster'], b: ['Hotel', 'House', 'Suites', 'Inn', 'Residence'] },
  tech: { a: ['Byte', 'Nimbus', 'Quanta', 'Pixel', 'Vector', 'Lattice', 'Orbit', 'Signal', 'Forge', 'Atlas'], b: ['Labs', 'Software', 'Digital', 'Studio', 'Systems', 'Works', 'AI'] },
  logistics: { a: ['Swift', 'Anchor', 'Blue Line', 'Atlas', 'Harbor', 'Express', 'Iron Horse', 'Northbound'], b: ['Freight', 'Logistics', 'Haulage', 'Transport', 'Carriers', 'Shipping'] },
  factory: { a: ['Meridian', 'Ironworks', 'Precision', 'Allied', 'Pioneer', 'Union', 'Keystone'], b: ['Manufacturing', 'Industries', 'Works', 'Fabrication', 'Mills', 'Production'] },
};

export const CLIENTS = ['Halcyon Insurance', 'Port Authority', 'Bayview Medical', 'Northwind Retail', 'Cobalt Bank', 'Meridian University', 'Seagate Hotels', 'Vireo Foods', 'Granite Construction', 'Lumen Energy', 'Orchid Pharma', 'Atlas Airlines', 'Pioneer Auto', 'Sable Media', 'Kestrel Telecom', 'Harbor Brewing Co.', 'Redwood Realty', 'Polaris Outdoor', 'City of Port Meridian', 'Krane Holdings'];

export const TECH_PROJECTS = ['Customer mobile app', 'E-commerce replatform', 'Data warehouse migration', 'Booking system', 'Internal CRM build', 'Payments integration', 'AI support chatbot', 'Website redesign', 'Inventory API', 'Security audit & fixes', 'Analytics dashboard', 'Loyalty app'];
export const FREIGHT_JOBS = ['Port container drayage', 'Retail store replenishment', 'Construction materials run', 'Cold-chain grocery route', 'E-commerce last-mile', 'Hospital supplies route', 'Brewery distribution', 'Furniture deliveries'];

export const REVIEW_TEMPLATES = {
  5: ['Absolutely loved it. New favourite spot!', 'Five stars, no notes.', 'Staff were incredible and the quality is top tier.', 'Worth every penny. Will be back.'],
  4: ['Really good, a little pricey but worth it.', 'Solid experience overall.', 'Great quality, service could be a bit faster.', 'Nice place, friendly people.'],
  3: ['It was okay. Nothing special.', 'Decent but the wait was long.', 'Average. Prices feel high for what you get.', 'Hit and miss.'],
  2: ['Disappointing. They were out of half the menu.', 'Overpriced and slow.', 'Staff seemed overwhelmed.', 'Wouldn\'t rush back.'],
  1: ['Terrible. Waited forever, then they ran out.', 'Avoid. Rude service and poor quality.', 'Worst experience in Port Meridian.', 'Way overpriced for what you get.'],
};

export const STOCKS = [
  { sym: 'KRN', name: 'Krane Holdings', sector: 'Conglomerate', price: 84, vol: 0.022, beta: 1.2, div: 0.012, shares: 120e6 },
  { sym: 'MTB', name: 'Meridian Trust Bancorp', sector: 'Finance', price: 52, vol: 0.016, beta: 1.3, div: 0.034, shares: 300e6 },
  { sym: 'HLX', name: 'Halcyon Insurance', sector: 'Finance', price: 118, vol: 0.012, beta: 0.8, div: 0.028, shares: 90e6 },
  { sym: 'NWR', name: 'Northwind Retail', sector: 'Retail', price: 37, vol: 0.02, beta: 1.1, div: 0.02, shares: 210e6 },
  { sym: 'VRO', name: 'Vireo Foods', sector: 'Consumer Staples', price: 64, vol: 0.011, beta: 0.6, div: 0.031, shares: 150e6 },
  { sym: 'LMN', name: 'Lumen Energy', sector: 'Energy', price: 41, vol: 0.024, beta: 1.0, div: 0.045, shares: 400e6 },
  { sym: 'KST', name: 'Kestrel Telecom', sector: 'Telecom', price: 29, vol: 0.013, beta: 0.7, div: 0.05, shares: 500e6 },
  { sym: 'QNT', name: 'Quanta Systems', sector: 'Technology', price: 212, vol: 0.031, beta: 1.5, div: 0, shares: 80e6 },
  { sym: 'ORC', name: 'Orchid Pharma', sector: 'Healthcare', price: 96, vol: 0.026, beta: 0.9, div: 0.015, shares: 110e6 },
  { sym: 'GRC', name: 'Granite Construction', sector: 'Industrials', price: 47, vol: 0.021, beta: 1.25, div: 0.022, shares: 160e6 },
  { sym: 'PMP', name: 'Port Meridian Ports', sector: 'Logistics', price: 58, vol: 0.017, beta: 1.05, div: 0.03, shares: 140e6 },
  { sym: 'SBL', name: 'Sable Media', sector: 'Media', price: 22, vol: 0.028, beta: 1.3, div: 0.01, shares: 260e6 },
];
