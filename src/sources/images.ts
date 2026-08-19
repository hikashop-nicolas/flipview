// A folder of pictures, one per page. No decoder, no worker: the browser already
// knows how to read these.
import type { PageSource } from "../source";

/** Plain list of image URLs, one per page. */
export async function createImageSource(urls: string[]): Promise<PageSource> {
  const probe = await loadImage(urls[0]);
  const aspect = probe.naturalWidth / probe.naturalHeight;
  return {
    kind: "images",
    pageCount: urls.length,
    aspect,
    async render(index, canvas) {
      const img = await loadImage(urls[index]);
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.getContext("2d")?.drawImage(img, 0, 0);
    },
    destroy() {},
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`flipview: cannot load ${src}`));
    img.src = src;
  });
}
