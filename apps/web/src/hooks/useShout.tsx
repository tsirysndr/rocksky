import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useCallback } from "react";
import {
  cancelReport,
  deleteShout,
  reply,
  reportShout,
  shout,
} from "../api/shouts";
import { API_URL } from "../consts";

export const useShoutMutation = () =>
  useMutation({
    mutationFn: ({ uri, message }: { uri: string; message: string }) =>
      shout(uri, message),
  });

export const useReplyMutation = () =>
  useMutation({
    mutationFn: ({ uri, message }: { uri: string; message: string }) =>
      reply(uri, message),
  });

export const useReportMutation = () =>
  useMutation({
    mutationFn: (uri: string) => reportShout(uri),
  });

export const useDeleteShoutMutation = () =>
  useMutation({
    mutationFn: deleteShout,
  });

export const useShoutsQuery = (uri: string) =>
  useQuery({
    queryKey: ["shouts", uri],
    queryFn: () =>
      axios.get(`${API_URL}/users/${uri.replace("at://", "")}/shouts`),
    select: (response) => response.data,
  });

export const useCancelReportMutation = () =>
  useMutation({
    mutationFn: cancelReport,
  });

function useShout() {
  const shout = async (uri: string, message: string) => {
    const response = await axios.post(
      `${API_URL}/users/${uri.replace("at://", "")}/shouts`,
      { message },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  const getShouts = useCallback(async (uri: string) => {
    const response = await axios.get(
      `${API_URL}/users/${uri.replace("at://", "")}/shouts`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  }, []);

  const reply = async (uri: string, message: string) => {
    const response = await axios.post(
      `${API_URL}/users/${uri.replace("at://", "")}/replies`,
      { message },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  const getReplies = useCallback(async (uri: string) => {
    const response = await axios.get(
      `${API_URL}/users/${uri.replace("at://", "")}/replies`
    );
    return response.data;
  }, []);

  const reportShout = async (uri: string) => {
    const response = await axios.post(
      `${API_URL}/users/${uri.replace("at://", "")}/report`,
      {},
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  const deleteShout = async (uri: string) => {
    const response = await axios.delete(
      `${API_URL}/users/${uri.replace("at://", "")}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  const cancelReport = async (uri: string) => {
    const response = await axios.delete(
      `${API_URL}/users/${uri.replace("at://", "")}/report`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  return {
    shout,
    getShouts,
    reply,
    getReplies,
    reportShout,
    deleteShout,
    cancelReport,
  };
}

export default useShout;
