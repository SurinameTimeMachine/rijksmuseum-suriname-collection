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
  source: 'thesaurus' | 'coordinates' | 'unresolved' | 'edit' | 'term-default';
  resolutionLevel: LocationResolutionLevel | null;
  flags: GeoFlag[];
  provenance: LocationProvenance | null;
}

export type LocationResolutionLevel = 'exact' | 'broader' | 'city' | 'country';

export type LocationEvidenceSource =
  | 'trefwoord'
  | 'beschrijving'
  | 'both'
  | 'bevestigd'
  | 'revert'
  | 'rejected';

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

export interface TermDefault {
  term: string;
  resolvedLocationLabel: string;
  wikidataQid: string | null;
  wikidataUrl: string | null;
  gazetteerUrl: string | null;
  lat: number | null;
  lng: number | null;
  resolutionLevel: LocationResolutionLevel;
  author: string;
  timestamp: string;
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

/**
 * Aggregated statistics computed from the raw Rijksmuseum CSV export
 * (data/Suriname_objecten_export.csv) — before any enrichment, geocoding,
 * Wikidata linking or curation.
 */
export interface RawCollectionStats {
  totalObjects: number;
  objectsByType: Record<string, number>;
  objectsByDecade: Record<string, number>;
  topCreators: { name: string; count: number }[];
  topGeographicKeywords: { name: string; count: number }[];
  dateRange: { earliest: number; latest: number };
  uniqueCreators: number;
  uniqueGeographicKeywords: number;
  anonymousCount: number;
}

/**
 * Counts that document the curation pipeline: how many records survive each
 * step from the raw CSV to a fully showable, geolocated, public-domain object.
 */
export interface CurationStats {
  totalObjects: number;
  withGeographicKeyword: number;
  withResolvedLocation: number;
  withSurinameLocation: number;
  withSurinameSpecificLocation: number;
  withWikidata: number;
  withCommons: number;
  withImage: number;
  publicDomain: number;
  showable: number;
  locationEditsApplied: number;
  termDefaultsApplied: number;
}

/**
 * A single object prepared for the honeycomb landing map: only records that
 * are showable (public-domain image + IIIF URL), have a year, and resolve to
 * a specific point in Suriname.
 */
export interface MapTimelineObject {
  objectnummer: string;
  title: string;
  year: number;
  creators: string[];
  objectTypes: string[];
  thumbnailUrl: string | null;
  imageUrl: string | null;
  isPublicDomain: boolean;
  lat: number;
  lng: number;
  locationLabel: string;
  resolutionLevel: LocationResolutionLevel;
}
