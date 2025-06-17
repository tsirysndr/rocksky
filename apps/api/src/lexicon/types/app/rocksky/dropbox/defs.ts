/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'

export interface FileView {
  /** The unique identifier of the file. */
  id?: string
  /** The name of the file. */
  name?: string
  /** The lowercased path of the file. */
  pathLower?: string
  /** The display path of the file. */
  pathDisplay?: string
  /** The last modified date and time of the file on the client. */
  clientModified?: string
  /** The last modified date and time of the file on the server. */
  serverModified?: string
  [k: string]: unknown
}

export function isFileView(v: unknown): v is FileView {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.dropbox.defs#fileView'
  )
}

export function validateFileView(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.dropbox.defs#fileView', v)
}

export interface FileListView {
  /** A list of files in the Dropbox. */
  files?: FileView[]
  [k: string]: unknown
}

export function isFileListView(v: unknown): v is FileListView {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.dropbox.defs#fileListView'
  )
}

export function validateFileListView(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.dropbox.defs#fileListView', v)
}

export interface TemporaryLinkView {
  /** The temporary link to access the file. */
  link?: string
  [k: string]: unknown
}

export function isTemporaryLinkView(v: unknown): v is TemporaryLinkView {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.dropbox.defs#temporaryLinkView'
  )
}

export function validateTemporaryLinkView(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.dropbox.defs#temporaryLinkView', v)
}
