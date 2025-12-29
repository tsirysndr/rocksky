/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.dropbox.defs";

export interface FileView {
  $type?: "app.rocksky.dropbox.defs#fileView";
  /** The unique identifier of the file. */
  id?: string;
  /** The name of the file. */
  name?: string;
  /** The lowercased path of the file. */
  pathLower?: string;
  /** The display path of the file. */
  pathDisplay?: string;
  /** The last modified date and time of the file on the client. */
  clientModified?: string;
  /** The last modified date and time of the file on the server. */
  serverModified?: string;
}

const hashFileView = "fileView";

export function isFileView<V>(v: V) {
  return is$typed(v, id, hashFileView);
}

export function validateFileView<V>(v: V) {
  return validate<FileView & V>(v, id, hashFileView);
}

export interface FileListView {
  $type?: "app.rocksky.dropbox.defs#fileListView";
  /** A list of files in the Dropbox. */
  files?: (FileView)[];
}

const hashFileListView = "fileListView";

export function isFileListView<V>(v: V) {
  return is$typed(v, id, hashFileListView);
}

export function validateFileListView<V>(v: V) {
  return validate<FileListView & V>(v, id, hashFileListView);
}

export interface TemporaryLinkView {
  $type?: "app.rocksky.dropbox.defs#temporaryLinkView";
  /** The temporary link to access the file. */
  link?: string;
}

const hashTemporaryLinkView = "temporaryLinkView";

export function isTemporaryLinkView<V>(v: V) {
  return is$typed(v, id, hashTemporaryLinkView);
}

export function validateTemporaryLinkView<V>(v: V) {
  return validate<TemporaryLinkView & V>(v, id, hashTemporaryLinkView);
}
