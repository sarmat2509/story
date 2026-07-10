/**
 * Load reference image data (base64) for image generation
 */
export async function loadReferenceImageData(
  imageUrl: string,
  assetStorage: any
): Promise<{ base64: string; mimeType: string }> {
  // Strip query parameters (signed URLs contain ?token=...&expires=...)
  const cleanUrl = imageUrl.split('?')[0];
  const imageBuffer = await assetStorage.getAssetByPath(cleanUrl);

  if (!imageBuffer) {
    throw new Error(`Failed to load reference image: ${imageUrl}`);
  }

  return {
    base64: imageBuffer.toString('base64'),
    mimeType: 'image/png', // Our system stores PNGs
  };
}
