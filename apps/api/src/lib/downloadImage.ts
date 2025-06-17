import axios from "axios";

export async function getContentType(url: string): Promise<string | null> {
  const response = await axios.head(url);
  return response.headers["content-type"] || null;
}

export default async function downloadImage(
  url?: string | null
): Promise<Buffer | null> {
  if (!url) {
    return null;
  }

  const response = await axios.get(url, {
    responseType: "arraybuffer",
  });
  return Buffer.from(response.data);
}
