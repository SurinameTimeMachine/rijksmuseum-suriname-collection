/**
 * Types for the crowdsourced geo-positioning feature.
 *
 * Users can place collection objects on the map with a camera position
 * and viewing angle (field-of-view cone), similar to the Gouda Time Machine.
 */

/** A single geo-position contribution for a collection object. */
export interface GeoPosition {
  /** Which object this position is for */
  objectnummer: string;
  /** Camera / standpoint latitude */
  lat: number;
  /** Camera / standpoint longitude */
  lng: number;
  /** Direction the camera faces, 0–360° (0 = North, 90 = East) */
  bearing: number;
  /** Field-of-view cone width in degrees (e.g. 60°) */
  fieldOfView: number;
  /** Whether the image depicts a recognisable outdoor scene */
  isOutdoor: boolean;
  /** What kind of location is depicted */
  locationType: 'street' | 'building' | 'landscape' | 'waterway' | 'other';
  /** Which geographicKeywords the user confirmed as visible in the image */
  confirmedKeywords: string[];
  /** GitHub username, or null for anonymous contributions */
  contributor: string | null;
  /** ISO 8601 timestamp */
  contributedAt: string;
  /** Moderation status */
  status: 'pending' | 'approved';
}

/**
 * The shape of data/geo-positions.json.
 * Keyed by objectnummer, holding an array of contributions (allowing
 * multiple per object for review / consensus).
 */
export type GeoPositionStore = Record<string, GeoPosition[]>;

/** Result of the triage step */
export interface TriageResult {
  objectnummer: string;
  isOutdoor: boolean;
  /** If not outdoor, user may give a reason */
  skipReason?: string;
}

/** Payload sent from the client editor to the API */
export interface ContributionPayload {
  objectnummer: string;
  lat: number;
  lng: number;
  bearing: number;
  fieldOfView: number;
  isOutdoor: boolean;
  locationType: GeoPosition['locationType'];
  confirmedKeywords: string[];
}

/** A GeoPosition joined with basic object data for display on the map */
export interface GeoPositionWithObject extends GeoPosition {
  title: string;
  creator: string;
  thumbnailUrl: string | null;
  year: number | null;
}

/** Session info stored in the auth cookie */
export interface GeoSession {
  username: string;
  avatarUrl: string;
}
