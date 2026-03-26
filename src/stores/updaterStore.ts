import { create } from "zustand";
import type { UpdateInfo } from "../lib/types";

export type UpdateCheckStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "error";

export type UpdateDownloadStatus =
  | "idle"
  | "downloading"
  | "ready"
  | "error";

interface UpdaterState {
  // Check state
  checkStatus: UpdateCheckStatus;
  lastChecked: number | null;
  availableUpdate: UpdateInfo | null;
  checkError: string | null;

  // Download state
  downloadStatus: UpdateDownloadStatus;
  downloadedBytes: number;
  totalBytes: number | null;

  // User preferences
  skippedVersion: string | null;

  // Actions
  setCheckStatus: (status: UpdateCheckStatus) => void;
  setAvailableUpdate: (update: UpdateInfo | null) => void;
  setCheckError: (error: string | null) => void;
  setDownloadStatus: (status: UpdateDownloadStatus) => void;
  setDownloadProgress: (downloaded: number, total: number | null) => void;
  setSkippedVersion: (version: string | null) => void;
  reset: () => void;
}

const initialState = {
  checkStatus: "idle" as UpdateCheckStatus,
  lastChecked: null as number | null,
  availableUpdate: null as UpdateInfo | null,
  checkError: null as string | null,
  downloadStatus: "idle" as UpdateDownloadStatus,
  downloadedBytes: 0,
  totalBytes: null as number | null,
};

export const useUpdaterStore = create<UpdaterState>((set) => ({
  ...initialState,
  skippedVersion: null,

  setCheckStatus: (status) =>
    set(() => ({
      checkStatus: status,
      lastChecked:
        status === "up-to-date" || status === "available"
          ? Date.now()
          : undefined,
    })),

  setAvailableUpdate: (update) =>
    set(() => ({
      availableUpdate: update,
      checkStatus: update ? "available" : "up-to-date",
      lastChecked: Date.now(),
    })),

  setCheckError: (error) =>
    set(() => ({
      checkError: error,
      checkStatus: "error",
    })),

  setDownloadStatus: (status) =>
    set(() => ({
      downloadStatus: status,
    })),

  setDownloadProgress: (downloaded, total) =>
    set(() => ({
      downloadedBytes: downloaded,
      totalBytes: total,
    })),

  setSkippedVersion: (version) =>
    set(() => ({
      skippedVersion: version,
    })),

  reset: () => set(() => ({ ...initialState })),
}));
