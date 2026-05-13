import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for
  // - … api routes
  // - … Next.js internals (_next)
  // - … public files (favicon, images, etc.)
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
