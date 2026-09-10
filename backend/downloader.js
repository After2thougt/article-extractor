import fs from "node:fs/promises";
import path from "node:path";

function getExtension(contentType, url) {
  const type = contentType?.split(";")[0].toLowerCase();

  const extensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
  };

  if (extensions[type]) {
    return extensions[type];
  }

  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);

    if (ext && ext.length <= 5) {
      return ext;
    }
  } catch {}

  return ".jpg";
}

export async function downloadImage(
  imageUrl,
  outputPath,
  referer
) {
  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36",
      Referer: referer,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Image returned HTTP ${response.status}`
    );
  }

  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.startsWith("image/")) {
    throw new Error("URL did not return an image");
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  const extension = getExtension(
    contentType,
    imageUrl
  );

  const finalPath = outputPath + extension;

  await fs.writeFile(finalPath, buffer);

  return finalPath;
}