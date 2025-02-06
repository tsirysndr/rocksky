import axios from "axios";

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
