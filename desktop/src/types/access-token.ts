export type AccessToken = {
  id: string;
  name: string;
  lastFour: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatedAccessToken = AccessToken & {
  token: string;
};
