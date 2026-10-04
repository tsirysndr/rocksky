import axios from "axios";
import { API_URL } from "../consts";
import { storage } from "../storage";
import type { GifEmbed } from "./klipy";

/** A shout as the UI consumes it, mapped from a `ShoutRow`. */
export type Shout = {
  id: string;
  uri: string;
  message: string;
  date: string;
  liked: boolean;
  reported: boolean;
  likes: number;
  gif?: GifEmbed;
  user: {
    did: string;
    avatar: string;
    displayName: string;
    handle: string;
  };
  replies?: Shout[];
};

/** A row from GET /users/:uri/shouts (and /replies). */
export type ShoutRow = {
  shouts: {
    id: string;
    uri: string;
    parent: string | null;
    content: string;
    createdAt: string;
    liked: boolean;
    reported: boolean;
    likes: number;
    gifUrl?: string | null;
    gifPreviewUrl?: string | null;
    gifAlt?: string | null;
    gifWidth?: number | null;
    gifHeight?: number | null;
  };
  users: {
    did: string;
    avatar: string;
    displayName: string;
    handle: string;
  };
};

const authHeader = () => ({ Authorization: `Bearer ${storage.getToken()}` });

export const shout = async (
  uri: string,
  message: string,
  gif?: GifEmbed,
): Promise<void> => {
  await axios.post(
    `${API_URL}/users/${uri.replace("at://", "")}/shouts`,
    { message, gif },
    { headers: { "Content-Type": "application/json", ...authHeader() } },
  );
};

export const getShouts = async (uri: string): Promise<ShoutRow[]> => {
  const response = await axios.get<ShoutRow[]>(
    `${API_URL}/users/${uri.replace("at://", "")}/shouts`,
    { headers: authHeader() },
  );
  return response.data;
};

export const reply = async (
  uri: string,
  message: string,
  gif?: GifEmbed,
): Promise<void> => {
  await axios.post(
    `${API_URL}/users/${uri.replace("at://", "")}/replies`,
    { message, gif },
    { headers: { "Content-Type": "application/json", ...authHeader() } },
  );
};

export const getReplies = async (uri: string): Promise<ShoutRow[]> => {
  const response = await axios.get<ShoutRow[]>(
    `${API_URL}/users/${uri.replace("at://", "")}/replies`,
  );
  return response.data;
};

export const reportShout = async (uri: string) => {
  const response = await axios.post(
    `${API_URL}/users/${uri.replace("at://", "")}/report`,
    {},
    { headers: authHeader() },
  );
  return response.data;
};

export const deleteShout = async (uri: string) => {
  const response = await axios.delete(
    `${API_URL}/users/${uri.replace("at://", "")}`,
    { headers: authHeader() },
  );
  return response.data;
};

export const cancelReport = async (uri: string) => {
  const response = await axios.delete(
    `${API_URL}/users/${uri.replace("at://", "")}/report`,
    { headers: authHeader() },
  );
  return response.data;
};
