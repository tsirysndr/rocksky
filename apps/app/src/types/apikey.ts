export type ApiKey = {
  id: string;
  name: string;
  description?: string;
  apiKey: string;
  sharedSecret: string;
  enabled: boolean;
  createdAt: string;
};
