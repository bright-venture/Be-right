// Which files people can upload. Photos are an explicit list, never "image/*": that would
// include SVG, which can carry script and runs it when opened from the storage link.

/** Photo formats phones and computers produce (HEIC/HEIF: iPhone). */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export function isPhotoType(contentType: string) {
  return (PHOTO_TYPES as readonly string[]).includes(contentType.toLowerCase());
}

/** Booking and problem-report media: photos, or a video in any format the phone records. */
export function isMediaType(contentType: string) {
  return isPhotoType(contentType) || contentType.toLowerCase().startsWith("video/");
}

/** For file pickers (`accept`): the photo formats, optionally with videos. */
export const PHOTO_ACCEPT = PHOTO_TYPES.join(",");
export const MEDIA_ACCEPT = `${PHOTO_ACCEPT},video/*`;
