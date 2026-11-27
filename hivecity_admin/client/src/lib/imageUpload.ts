/**
 * Client-side image compression helper for Events, Nutrient Recipes, and Marketplace Products.
 * Compresses selected image files to crisp JPEG data URLs safe for Firestore (< 1MB) & localStorage sync.
 */
export async function compressImageFileToDataUrl(
  file: File,
  maxDimension = 900,
  quality = 0.78
): Promise<string> {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Please select a valid image file (PNG, JPG, WebP, or GIF).");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Image must be smaller than 10 MB.");
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected image."));
    reader.readAsDataURL(file);
  });

  // Attempt canvas downscale + JPEG compression so images stay compact (< 250 KB)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode image."));
      el.src = rawDataUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
    const targetW = Math.max(1, Math.round((img.width || maxDimension) * scale));
    const targetH = Math.max(1, Math.round((img.height || maxDimension) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return rawDataUrl;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    let compressed = canvas.toDataURL("image/jpeg", quality);
    if (compressed.length > 420_000) {
      compressed = canvas.toDataURL("image/jpeg", 0.62);
    }
    return compressed || rawDataUrl;
  } catch {
    return rawDataUrl;
  }
}
