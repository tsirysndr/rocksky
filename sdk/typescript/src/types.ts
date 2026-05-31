export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type AuthProvider = string | (() => string | Promise<string>);

export type ClientOptions = {
  baseUrl?: string;
  auth?: AuthProvider;
  fetch?: FetchLike;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  userAgent?: string;
};

export type RequestOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  auth?: AuthProvider | null;
};

export type Pagination = {
  limit?: number;
  offset?: number;
  cursor?: string;
};

export const DEFAULT_BASE_URL = "https://api.rocksky.app";
