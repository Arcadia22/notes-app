// Compresses an image file down to a Base64 data URL small enough to
// store directly in a Firestore document (1MB hard limit per doc).
// Works by drawing the image onto a canvas at a reduced size, then
// re-encoding as JPEG at moderate quality — this is what keeps a
// multi-MB camera photo or Pinterest download well under the limit.
//
// maxDimension: longest side (width or height) gets capped to this,
//   the other side scales proportionally — 1200px is plenty for
//   viewing on a board, no need to preserve print-resolution detail.
// quality: JPEG compression quality, 0-1
// maxOutputBytes: safety ceiling — if even compression can't get
//   under this, the function throws so the caller can show a clear
//   "image too large" message instead of silently failing later.
export function compressImageFile(file, { maxDimension = 1200, quality = 0.75, maxOutputBytes = 900_000 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't load the image."));
      img.onload = () => {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height / width) * maxDimension);
            width = maxDimension;
          } else {
            width = Math.round((width / height) * maxDimension);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Try progressively lower quality if the first pass is still
        // too big, rather than failing immediately on a dense image.
        let q = quality;
        let dataUrl = canvas.toDataURL("image/jpeg", q);
        let attempts = 0;
        while (dataUrl.length > maxOutputBytes && attempts < 4) {
          q -= 0.15;
          dataUrl = canvas.toDataURL("image/jpeg", Math.max(q, 0.2));
          attempts++;
        }

        if (dataUrl.length > maxOutputBytes) {
          reject(new Error("This image is too large even after compression — try a smaller one."));
          return;
        }

        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
