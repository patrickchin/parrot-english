import { contentCatalogUrl } from './catalog';
import { loadContent } from './content-pack';

const path = window.location.pathname.replace(/^\/(?:en|zh|es|ja|ko)(?=\/|$)/, '') || '/';
// Shared playback, owner tools and unknown URLs do not need discovery.
const needsCatalog = /^\/(?:packs(?:\/pack_[A-Za-z0-9_-]{1,80})?|library\/[a-z0-9-]+|scenes\/[a-z0-9-]+(?:\/dubs\/[A-Za-z0-9_-]+)?|dubs)?\/?$/.test(path);
export const startupContent = needsCatalog ? loadContent(contentCatalogUrl) : undefined;
// React may still be downloading when discovery fails; its provider handles the error.
void startupContent?.catch(() => {});
