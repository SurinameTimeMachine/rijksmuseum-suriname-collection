import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Derive a short, human-readable license name from a Creative Commons URI
 * and/or a license label string.
 *
 * Returns e.g. "CC0", "PDM 1.0", "© Name", or null if unknown.
 */
export function getLicenseShortName(
  licenseUri: string | null,
  licenseLabel: string | null,
): { name: string; url: string | null; isUnknown: boolean } {
  // Map known CC URIs to short names
  if (licenseUri) {
    if (licenseUri.includes('publicdomain/zero'))
      return { name: 'CC0 1.0', url: licenseUri, isUnknown: false };
    if (licenseUri.includes('publicdomain/mark'))
      return { name: 'PDM 1.0', url: licenseUri, isUnknown: false };
    if (licenseUri.includes('/by-sa/'))
      return { name: 'CC BY-SA', url: licenseUri, isUnknown: false };
    if (licenseUri.includes('/by-nc-sa/'))
      return { name: 'CC BY-NC-SA', url: licenseUri, isUnknown: false };
    if (licenseUri.includes('/by-nc-nd/'))
      return { name: 'CC BY-NC-ND', url: licenseUri, isUnknown: false };
    if (licenseUri.includes('/by-nc/'))
      return { name: 'CC BY-NC', url: licenseUri, isUnknown: false };
    if (licenseUri.includes('/by-nd/'))
      return { name: 'CC BY-ND', url: licenseUri, isUnknown: false };
    if (licenseUri.includes('/by/'))
      return { name: 'CC BY', url: licenseUri, isUnknown: false };
  }

  // Check label for known public domain strings
  if (licenseLabel) {
    const lower = licenseLabel.toLowerCase();
    if (lower === 'public domain' || lower === 'publieke domein')
      return { name: 'Public Domain', url: licenseUri, isUnknown: false };
    if (lower === 'copyright' || lower === 'auteursrecht')
      return { name: '©', url: null, isUnknown: false };
    // Label is a copyright holder name
    return { name: `© ${licenseLabel}`, url: null, isUnknown: false };
  }

  // No license info at all
  return { name: '', url: null, isUnknown: true };
}
