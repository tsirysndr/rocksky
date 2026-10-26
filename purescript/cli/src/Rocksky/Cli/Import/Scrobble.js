export const callImpl=agent=>method=>record=>()=>agent[method](record);
export const existingImpl=dedup=>input=>()=>dedup.index.scrobbleUri(dedup.did,input.title,input.artist,input.album??'',input.timestamp);
export const isoTimestamp=seconds=>new Date(seconds*1000).toISOString();
