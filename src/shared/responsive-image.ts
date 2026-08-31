export function retryOriginalImage(image: HTMLImageElement) {
  if (!image.hasAttribute("srcset")) return false;
  const originalSource = image.src;
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.src = originalSource;
  return true;
}
