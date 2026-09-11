// Email tracking helpers: inject open pixel and click redirect URLs into email HTML.
// The tracking pixel is a 1x1 transparent GIF that fires when the email client loads images.
// Click redirect rewrites all <a href> URLs through /api/track/click for analytics.

const TRACKING_PIXEL_GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Build the tracking pixel URL for open tracking.
 * Format: /api/track/open?j={emailJobId}&c={campaignId}
 */
export function buildOpenTrackingUrl(
  emailJobId: string,
  campaignId: string | null,
  baseUrl: string,
): string {
  const params = new URLSearchParams({ j: emailJobId });
  if (campaignId) params.set('c', campaignId);
  return `${baseUrl}/api/track/open?${params.toString()}`;
}

/**
 * Build a click redirect URL.
 * Format: /api/track/click?j={emailJobId}&c={campaignId}&url={encodedUrl}
 */
export function buildClickRedirectUrl(
  emailJobId: string,
  campaignId: string | null,
  originalUrl: string,
  baseUrl: string,
): string {
  const params = new URLSearchParams({ j: emailJobId, url: originalUrl });
  if (campaignId) params.set('c', campaignId);
  return `${baseUrl}/api/track/click?${params.toString()}`;
}

/**
 * Inject tracking into email HTML:
 * 1. Add a 1x1 tracking pixel before </body>
 * 2. Rewrite all <a href> URLs through click redirect
 */
export function injectTracking(
  html: string,
  emailJobId: string,
  campaignId: string | null,
  baseUrl: string,
): string {
  let result = html;

  // 1. Inject tracking pixel before </body> or at end
  const openUrl = buildOpenTrackingUrl(emailJobId, campaignId, baseUrl);
  const pixel = `<img src="${openUrl}" width="1" height="1" style="display:none;" alt="" />`;

  if (result.toLowerCase().includes('</body>')) {
    result = result.replace(/<\/body>/i, `${pixel}</body>`);
  } else {
    result = result + pixel;
  }

  // 2. Rewrite <a href> URLs through click redirect
  // Match href="..." and href='...' — skip mailto:, tel:, # anchors
  result = result.replace(
    /href=["']((?!mailto:|tel:|#|javascript:)[^"']+)["']/gi,
    (match, url) => {
      // Don't redirect tracking pixel or already-redirected URLs
      if (url.includes('/api/track/')) return match;
      // Don't redirect relative URLs that don't look like external links
      if (url.startsWith('/') && !url.startsWith('//')) return match;
      const redirectUrl = buildClickRedirectUrl(emailJobId, campaignId, url, baseUrl);
      return `href="${redirectUrl}"`;
    },
  );

  return result;
}

/**
 * Get the 1x1 transparent GIF buffer for the open tracking pixel response.
 */
export function getTrackingPixelBuffer(): Buffer {
  return Buffer.from(TRACKING_PIXEL_GIF, 'base64');
}
