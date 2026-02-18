import { GeoLocation } from '@/types/collection';

/**
 * Manual geocoding lookup for geographic keywords found in the CSV.
 * Coordinates are approximate historical/modern locations.
 */
export const geoCoordinates: Record<string, GeoLocation> = {
  // === SURINAME — Cities & Towns ===
  'Paramaribo (stad)': {
    name: 'Paramaribo',
    lat: 5.852,
    lng: -55.2038,
    region: 'suriname',
  },
  'Nieuw-Nickerie': {
    name: 'Nieuw-Nickerie',
    lat: 5.9264,
    lng: -56.9731,
    region: 'suriname',
  },
  Albina: { name: 'Albina', lat: 5.4968, lng: -54.0551, region: 'suriname' },
  Moengo: { name: 'Moengo', lat: 5.6167, lng: -54.4, region: 'suriname' },
  Koffiekamp: {
    name: 'Koffiekamp',
    lat: 5.05,
    lng: -55.5,
    region: 'suriname',
  },

  // === SURINAME — General ===
  'Suriname (Zuid-Amerika)': {
    name: 'Suriname',
    lat: 5.0,
    lng: -55.5,
    region: 'suriname',
  },

  // === SURINAME — Districts ===
  Nickerie: { name: 'Nickerie', lat: 5.8, lng: -57.0, region: 'suriname' },
  Coronie: { name: 'Coronie', lat: 5.6, lng: -56.3, region: 'suriname' },
  Commewijne: {
    name: 'Commewijne',
    lat: 5.75,
    lng: -54.9,
    region: 'suriname',
  },
  Marowijne: { name: 'Marowijne', lat: 5.5, lng: -54.2, region: 'suriname' },
  Saramacca: { name: 'Saramacca', lat: 5.72, lng: -55.7, region: 'suriname' },

  // === SURINAME — Rivers ===
  Surinamerivier: {
    name: 'Suriname River',
    lat: 5.5,
    lng: -55.15,
    region: 'suriname',
  },
  Cottica: { name: 'Cottica River', lat: 5.3, lng: -54.3, region: 'suriname' },
  'Boven-Suriname': {
    name: 'Upper Suriname River',
    lat: 4.5,
    lng: -55.5,
    region: 'suriname',
  },

  // === SURINAME — Plantations ===
  'Plantage Mariënbosch': {
    name: 'Plantage Mariënbosch',
    lat: 5.72,
    lng: -54.95,
    region: 'suriname',
  },
  'Plantage Meerzorg': {
    name: 'Plantage Meerzorg',
    lat: 5.83,
    lng: -55.14,
    region: 'suriname',
  },
  'Plantage Surimombo': {
    name: 'Plantage Surimombo',
    lat: 5.7,
    lng: -55.1,
    region: 'suriname',
  },
  'Plantage Palmeneribo': {
    name: 'Plantage Palmeneribo',
    lat: 5.68,
    lng: -55.08,
    region: 'suriname',
  },
  'Plantage Ma Retraite': {
    name: 'Plantage Ma Retraite',
    lat: 5.82,
    lng: -55.17,
    region: 'suriname',
  },
  'Plantage Jagtlust': {
    name: 'Plantage Jagtlust',
    lat: 5.73,
    lng: -55.05,
    region: 'suriname',
  },
  'Plantage Sorgvliet': {
    name: 'Plantage Sorgvliet',
    lat: 5.76,
    lng: -55.0,
    region: 'suriname',
  },
  'Plantage Frederiksdorp': {
    name: 'Plantage Frederiksdorp',
    lat: 5.75,
    lng: -54.89,
    region: 'suriname',
  },
  'Plantage Visserszorg': {
    name: 'Plantage Visserszorg',
    lat: 5.78,
    lng: -55.06,
    region: 'suriname',
  },
  'Plantage Zorg & Hoop': {
    name: 'Plantage Zorg & Hoop',
    lat: 5.84,
    lng: -55.19,
    region: 'suriname',
  },
  'Plantage Rosenburg': {
    name: 'Plantage Rosenburg',
    lat: 5.71,
    lng: -55.02,
    region: 'suriname',
  },
  'Plantage Kroonenburg': {
    name: 'Plantage Kroonenburg',
    lat: 5.74,
    lng: -54.97,
    region: 'suriname',
  },
  'Plantage Voorburg': {
    name: 'Plantage Voorburg',
    lat: 5.76,
    lng: -55.08,
    region: 'suriname',
  },
  'Plantage Leliëndaal': {
    name: 'Plantage Leliëndaal',
    lat: 5.77,
    lng: -54.92,
    region: 'suriname',
  },
  'Plantage Tourtonne': {
    name: 'Plantage Tourtonne',
    lat: 5.69,
    lng: -56.32,
    region: 'suriname',
  },
  'Plantage Elisabethshoop': {
    name: 'Plantage Elisabethshoop',
    lat: 5.74,
    lng: -54.93,
    region: 'suriname',
  },
  'Plantage Leasowes': {
    name: 'Plantage Leasowes',
    lat: 5.85,
    lng: -56.8,
    region: 'suriname',
  },

  // === SURINAME — Forts & Landmarks ===
  'Fort Zeelandia (Paramaribo)': {
    name: 'Fort Zeelandia',
    lat: 5.8381,
    lng: -55.1489,
    region: 'suriname',
  },
  'Fort Leyden': {
    name: 'Fort Leyden',
    lat: 5.78,
    lng: -54.88,
    region: 'suriname',
  },
  Jodensavanne: {
    name: 'Jodensavanne',
    lat: 5.43,
    lng: -55.14,
    region: 'suriname',
  },
  'Sommelsdijk (Suriname)': {
    name: 'Sommelsdijk',
    lat: 5.85,
    lng: -55.16,
    region: 'suriname',
  },
  'Catharina Sophia': {
    name: 'Catharina Sophia',
    lat: 5.68,
    lng: -55.62,
    region: 'suriname',
  },

  // === NETHERLANDS ===
  Amsterdam: {
    name: 'Amsterdam',
    lat: 52.3676,
    lng: 4.9041,
    region: 'netherlands',
  },
  'Den Haag': {
    name: 'Den Haag',
    lat: 52.0705,
    lng: 4.3007,
    region: 'netherlands',
  },
  Rotterdam: {
    name: 'Rotterdam',
    lat: 51.9244,
    lng: 4.4777,
    region: 'netherlands',
  },
  'Utrecht (stad)': {
    name: 'Utrecht',
    lat: 52.0907,
    lng: 5.1214,
    region: 'netherlands',
  },
  Rijswijk: { name: 'Rijswijk', lat: 52.04, lng: 4.32, region: 'netherlands' },
  Vlissingen: {
    name: 'Vlissingen',
    lat: 51.4427,
    lng: 3.5715,
    region: 'netherlands',
  },
  Scheveningen: {
    name: 'Scheveningen',
    lat: 52.1082,
    lng: 4.2725,
    region: 'netherlands',
  },
  'Bergen (Noord-Holland)': {
    name: 'Bergen',
    lat: 52.6656,
    lng: 4.7026,
    region: 'netherlands',
  },
  'Sint-Michielsgestel': {
    name: 'Sint-Michielsgestel',
    lat: 51.6425,
    lng: 5.3541,
    region: 'netherlands',
  },
};
