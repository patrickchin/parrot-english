export const PUBLIC_APP_ORIGIN = "https://parrotbook.com";

const PUBLIC_APP_HOSTNAME = new URL(PUBLIC_APP_ORIGIN).hostname;
const PUBLIC_APP_HOSTNAMES = new Set([
  PUBLIC_APP_HOSTNAME,
  `www.${PUBLIC_APP_HOSTNAME}`,
]);

export function createPublicAppRedirect(url: URL): Response | null {
  if (!PUBLIC_APP_HOSTNAMES.has(url.hostname)) return null;

  if (
    url.protocol === "https:" &&
    url.hostname === PUBLIC_APP_HOSTNAME &&
    url.port === ""
  ) {
    return null;
  }

  url.protocol = "https:";
  url.hostname = PUBLIC_APP_HOSTNAME;
  url.port = "";

  return Response.redirect(url.toString(), 308);
}
