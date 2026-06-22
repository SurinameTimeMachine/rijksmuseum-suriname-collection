import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

// These crawlers are explicitly disallowed from object pages in robots.txt.
// Enforce that policy before Next renders the large object route: robots.txt
// is voluntary and does not stop crawlers that ignore it.
const BLOCKED_OBJECT_CRAWLER_RE =
  /\b(?:ahrefsbot|semrushbot|dotbot|mj12bot|googlebot-image)\b/i;
const OBJECT_PATH_RE = new RegExp(
  `^/(?:${routing.locales.join('|')})/object/`,
);

export default function proxy(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') ?? '';

  if (
    OBJECT_PATH_RE.test(request.nextUrl.pathname) &&
    BLOCKED_OBJECT_CRAWLER_RE.test(userAgent)
  ) {
    return new NextResponse('Forbidden', {
      status: 403,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  return handleI18nRouting(request);
}

export const config = {
  // Match all pathnames except for
  // - … api routes
  // - … Next.js internals (_next)
  // - … public files (favicon, images, etc.)
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
