/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

export interface FileView {
  /** The unique identifier of the file. */
  id?: string;
  name?: string;
  fileId?: string;
  directoryId?: string;
  trackId?: string;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

export function isFileView(v: unknown): v is FileView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.googledrive.defs#fileView"
  );
}

export function validateFileView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.googledrive.defs#fileView", v);
}

export interface FileListView {
  files?: FileView[];
  directory?: ResponseDirectoryView;
  parentDirectory?: ResponseParentDirectoryView;
  directories?: ResponseDirectoriesItemView[];
  [k: string]: unknown;
}

export function isFileListView(v: unknown): v is FileListView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.googledrive.defs#fileListView"
  );
}

export function validateFileListView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.googledrive.defs#fileListView", v);
}

export interface ResponseDirectoryView {
  [k: string]: unknown;
}

export function isResponseDirectoryView(
  v: unknown,
): v is ResponseDirectoryView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.googledrive.defs#responseDirectoryView"
  );
}

export function validateResponseDirectoryView(v: unknown): ValidationResult {
  return lexicons.validate(
    "app.rocksky.googledrive.defs#responseDirectoryView",
    v,
  );
}

export interface ResponseParentDirectoryView {
  [k: string]: unknown;
}

export function isResponseParentDirectoryView(
  v: unknown,
): v is ResponseParentDirectoryView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.googledrive.defs#responseParentDirectoryView"
  );
}

export function validateResponseParentDirectoryView(
  v: unknown,
): ValidationResult {
  return lexicons.validate(
    "app.rocksky.googledrive.defs#responseParentDirectoryView",
    v,
  );
}

export interface ResponseDirectoriesItemView {
  id?: string;
  name?: string;
  fileId?: string;
  path?: string;
  parentId?: string;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

export function isResponseDirectoriesItemView(
  v: unknown,
): v is ResponseDirectoriesItemView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.googledrive.defs#responseDirectoriesItemView"
  );
}

export function validateResponseDirectoriesItemView(
  v: unknown,
): ValidationResult {
  return lexicons.validate(
    "app.rocksky.googledrive.defs#responseDirectoriesItemView",
    v,
  );
}
