export interface CollectionObject {
  recordnummer: number;
  objectnummer: string;
  titles: string[];
  description: string;
  creators: string[];
  dateStart: string;
  dateEnd: string;
  year: number | null;
  objectTypes: string[];
  materials: string[];
  classificationCode: string;
  contentClassificationCodes: string[];
  geographicKeywords: string[];
  mainMotifGeneral: string[];
  mainMotifSpecific: string[];
  subjects: string[];
  persons: string[];
  pidData: string;
  pidWork: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  hasImage: boolean;
}

export interface FilterOptions {
  objectTypes: string[];
  dateFrom: number | null;
  dateTo: number | null;
  creators: string[];
  geographicKeywords: string[];
  subjects: string[];
  materials: string[];
  query: string;
  hasImage: boolean | null;
}

export interface CollectionStats {
  totalObjects: number;
  objectsByType: Record<string, number>;
  objectsByDecade: Record<string, number>;
  topCreators: { name: string; count: number }[];
  topLocations: { name: string; count: number }[];
  topSubjects: { name: string; count: number }[];
  topMaterials: { name: string; count: number }[];
  dateRange: { earliest: number; latest: number };
  objectsWithImages: number;
}

export interface GeoLocation {
  name: string;
  lat: number;
  lng: number;
  objectCount?: number;
  region: 'suriname' | 'netherlands' | 'other';
}

export type SortOption = 'date-asc' | 'date-desc' | 'title' | 'relevance';

export type Locale = 'en' | 'nl';
