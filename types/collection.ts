export interface GeoKeywordDetail {
  term: string;
  broaderTerm: string | null;
  matchedLabel: string | null;
  gettyUri: string | null;
  wikidataUri: string | null;
  stmGazetteerUrl?: string | null;
  geonamesUri: string | null;
  lat: number | null;
  lng: number | null;
  region: 'suriname' | 'netherlands' | 'other' | null;
  source: 'thesaurus' | 'coordinates' | 'unresolved' | 'edit';
  resolutionLevel: LocationResolutionLevel | null;
  flags: GeoFlag[];
  provenance: LocationProvenance | null;
}

export type LocationResolutionLevel =
  | 'exact'
  | 'broader'
  | 'city'
  | 'country';

export type LocationEvidenceSource = 'trefwoord' | 'beschrijving' | 'both';

export type GeoFlag = 'outside-suriname';

export interface LocationProvenance {
  author: string;
  timestamp: string;
  remark: string | null;
}

export interface LocationEditRecord extends LocationProvenance {
  recordnummer: number;
  objectnummer: string;
  originalTerm: string;
  resolvedLocationLabel: string;
  wikidataQid: string | null;
  wikidataUrl: string | null;
  gazetteerUrl: string | null;
  lat: number | null;
  lng: number | null;
  resolutionLevel: LocationResolutionLevel;
  evidenceSource: LocationEvidenceSource;
  evidenceText: string | null;
}

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
  geoKeywordDetails: GeoKeywordDetail[];
  mainMotifGeneral: string[];
  mainMotifSpecific: string[];
  subjects: string[];
  persons: string[];
  pidData: string;
  pidWork: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  hasImage: boolean;
  copyrightHolder: string | null;
  license: string | null;
  licenseLabel: string | null;
  isPublicDomain: boolean;
  wikidataUrl: string | null;
  wikimediaUrl: string | null;
}

export interface FilterOptions {
  objectTypes: string[];
  dateFrom: number | null;
  dateTo: number | null;
  creators: string[];
  geographicKeywords: string[];
  subjects: string[];
  materials: string[];
  licenseStatuses: Array<'public-domain' | 'copyrighted' | 'unknown'>;
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
