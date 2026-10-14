/** Only a confirmed absence allows publication; a failed lookup is retryable. */
export async function findDurableRecord(
  lookup: () => Promise<{ data: { uri: string } }>,
): Promise<string | undefined> {
  try {
    return (await lookup()).data.uri;
  } catch (error) {
    if ((error as { error?: string }).error === "RecordNotFound")
      return undefined;
    throw error;
  }
}

/** The create callback MUST use the persisted rkey and swapRecord:null. */
export async function publishDurableRecord(
  create: () => Promise<{ data: { uri: string } }>,
  lookup: () => Promise<{ data: { uri: string } }>,
): Promise<string> {
  try {
    return (await create()).data.uri;
  } catch (error) {
    // A timeout can mean the write succeeded but its reply was lost.
    const uri = await findDurableRecord(lookup);
    if (uri) return uri;
    throw error;
  }
}
