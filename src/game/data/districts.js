// District economics & demographics for Port Meridian.
// rent*: $ per m2 per month. price*: $ per m2 to buy. foot: relative pedestrian traffic.
// affinity: demand multiplier per business type, reflecting who lives / works / visits there.

export const DISTRICTS = {
  downtown: {
    id: 'downtown', name: 'Financial District', short: 'FIN', color: '#4fa3e0',
    foot: 1.0, wealth: 1.4, population: 42000, workers: 165000, tourism: 0.6, crime: 0.25,
    rent: { retail: 64, office: 52, industrial: 0, residential: 46 },
    price: { retail: 10400, office: 8600, industrial: 0, residential: 9200 },
    affinity: { cafe: 1.45, restaurant: 1.3, boutique: 1.15, grocery: 0.7, bar: 1.25, gym: 1.3, hotel: 1.4, tech: 1.4, logistics: 0.2, factory: 0, pharmacy: 1.0, bakery: 1.1 },
    desc: 'Glass towers, bankers and lunch rushes. Highest foot traffic and the highest rents in the city.',
  },
  midtown: {
    id: 'midtown', name: 'Midtown', short: 'MID', color: '#e0a54f',
    foot: 0.85, wealth: 1.1, population: 88000, workers: 70000, tourism: 0.55, crime: 0.3,
    rent: { retail: 44, office: 34, industrial: 0, residential: 32 },
    price: { retail: 7100, office: 5600, industrial: 0, residential: 6200 },
    affinity: { cafe: 1.2, restaurant: 1.35, boutique: 1.35, grocery: 1.0, bar: 1.3, gym: 1.1, hotel: 1.15, tech: 1.15, logistics: 0.3, factory: 0, pharmacy: 1.1, bakery: 1.2 },
    desc: 'Shopping streets, theatres and dense apartments. Strong retail and dining demand.',
  },
  northside: {
    id: 'northside', name: 'Northside', short: 'NTH', color: '#b07ad6',
    foot: 0.5, wealth: 0.9, population: 120000, workers: 15000, tourism: 0.1, crime: 0.35,
    rent: { retail: 27, office: 20, industrial: 0, residential: 24 },
    price: { retail: 4100, office: 3300, industrial: 0, residential: 3900 },
    affinity: { cafe: 1.0, restaurant: 0.95, boutique: 0.75, grocery: 1.5, bar: 0.9, gym: 1.15, hotel: 0.3, tech: 0.6, logistics: 0.3, factory: 0, pharmacy: 1.4, bakery: 1.35 },
    desc: 'Brick walk-ups and young families. Everyday needs: groceries, pharmacies, bakeries.',
  },
  westbrook: {
    id: 'westbrook', name: 'Westbrook', short: 'WST', color: '#6cc48a',
    foot: 0.3, wealth: 1.3, population: 46000, workers: 4000, tourism: 0.05, crime: 0.1,
    rent: { retail: 24, office: 18, industrial: 0, residential: 22 },
    price: { retail: 3600, office: 2900, industrial: 0, residential: 4300 },
    affinity: { cafe: 0.9, restaurant: 1.0, boutique: 0.9, grocery: 1.4, bar: 0.6, gym: 1.25, hotel: 0.2, tech: 0.4, logistics: 0.2, factory: 0, pharmacy: 1.3, bakery: 1.2 },
    desc: 'Leafy suburbs with affluent households. Low traffic but loyal, high-spending customers.',
  },
  park: {
    id: 'park', name: 'Central Park', short: 'PRK', color: '#3f9e57',
    foot: 0.6, wealth: 1.0, population: 0, workers: 0, tourism: 0.8, crime: 0.15,
    rent: { retail: 0, office: 0, industrial: 0, residential: 0 },
    price: { retail: 0, office: 0, industrial: 0, residential: 0 },
    affinity: {},
    desc: 'The green heart of Port Meridian.',
  },
  ironworks: {
    id: 'ironworks', name: 'Ironworks', short: 'IRN', color: '#c86a4a',
    foot: 0.22, wealth: 0.75, population: 9000, workers: 38000, tourism: 0.02, crime: 0.45,
    rent: { retail: 16, office: 14, industrial: 11, residential: 15 },
    price: { retail: 2100, office: 1900, industrial: 1350, residential: 1800 },
    affinity: { cafe: 0.7, restaurant: 0.7, boutique: 0.2, grocery: 0.6, bar: 0.8, gym: 0.5, hotel: 0.1, tech: 0.5, logistics: 1.4, factory: 1.5, pharmacy: 0.4, bakery: 0.6 },
    desc: 'Factories, rail yards and warehouses. Cheap space, power and freight access.',
  },
  harbor: {
    id: 'harbor', name: 'Harborfront', short: 'HBR', color: '#3fc1c9',
    foot: 0.65, wealth: 1.05, population: 21000, workers: 26000, tourism: 0.9, crime: 0.3,
    rent: { retail: 38, office: 26, industrial: 14, residential: 30 },
    price: { retail: 5600, office: 4200, industrial: 1700, residential: 5100 },
    affinity: { cafe: 1.15, restaurant: 1.45, boutique: 1.0, grocery: 0.7, bar: 1.4, gym: 0.7, hotel: 1.35, tech: 0.7, logistics: 1.5, factory: 0.9, pharmacy: 0.7, bakery: 1.0 },
    desc: 'Waterfront promenade, seafood joints and the container port. Tourists by day, nightlife by night.',
  },
};

export const DISTRICT_IDS = Object.keys(DISTRICTS);
