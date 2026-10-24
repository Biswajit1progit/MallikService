// Photo uploads go straight from the browser to Cloudinary (unsigned preset),
// so our server never handles image bytes - it only stores the returned URLs.
const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export function isCloudinaryConfigured() {
  return Boolean(CLOUD && PRESET);
}

// Phone cameras produce 4-8 MB photos. Shrinking to ~1600px wide keeps them
// sharp enough for a warranty claim while uploading fast on a weak 4G signal.
async function shrinkImage(file, maxSide = 1600, quality = 0.8) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob || file;
  } catch {
    return file; // if shrinking fails for any reason, upload the original
  }
}

export async function uploadImage(file) {
  if (!isCloudinaryConfigured()) {
    throw new Error("Photo upload isn't set up yet (missing Cloudinary settings).");
  }
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");

  const body = new FormData();
  body.append("file", await shrinkImage(file));
  body.append("upload_preset", PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error("Photo upload failed. Check your connection and try again.");
  const data = await res.json();
  return data.secure_url; // https://res.cloudinary.com/<cloud>/image/upload/...
}