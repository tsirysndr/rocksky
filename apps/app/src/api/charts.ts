import { client } from ".";

export const getScrobblesChart = () => {
  return [];
};

export const getSongChart = async (uri: string) => {
  const response = await client.get(
    "/xrpc/app.rocksky.charts.getScrobblesChart",
    { params: { songuri: uri } },
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};

export const getArtistChart = async (uri: string) => {
  const response = await client.get(
    "/xrpc/app.rocksky.charts.getScrobblesChart",
    { params: { artisturi: uri } },
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};

export const getAlbumChart = async (uri: string) => {
  const response = await client.get(
    "/xrpc/app.rocksky.charts.getScrobblesChart",
    { params: { albumuri: uri } },
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};

export const getProfileChart = async (did: string) => {
  const response = await client.get(
    "/xrpc/app.rocksky.charts.getScrobblesChart",
    { params: { did } },
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};

export const getGenreChart = async (genre: string) => {
  const response = await client.get(
    "/xrpc/app.rocksky.charts.getScrobblesChart",
    { params: { genre } },
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};
