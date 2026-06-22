type LoaderProps = {
  src: string;
  width: number;
  quality?: number;
};

const IIIF_WIDTH_SEGMENT = /\/full\/\d+,\/0\/default\.jpg$/;

/**
 * Produce native IIIF size variants instead of sending image requests through
 * Vercel's image optimizer. The source URLs already encode a IIIF width.
 */
export default function iiifLoader({ src, width }: LoaderProps): string {
  return src.replace(IIIF_WIDTH_SEGMENT, `/full/${width},/0/default.jpg`);
}
