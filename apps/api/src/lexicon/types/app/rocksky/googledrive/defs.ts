/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { BlobRef, type ValidationResult } from "@atproto/lexicon";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../../lexicons";
import { hasProp, isObj } from "../../../../util";

export interface FileView {
  /** The unique identifier of the file. */
  id?: string;
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
