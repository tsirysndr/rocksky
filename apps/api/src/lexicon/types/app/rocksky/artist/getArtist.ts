/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type express from 'express'
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'
import type { HandlerAuth, HandlerPipeThrough } from '@atproto/xrpc-server'
import type * as AppRockskyArtistDefs from './defs'

export interface QueryParams {
  /** The URI of the artist to retrieve details from */
  uri: string
}

export type InputSchema = undefined
export type OutputSchema = AppRockskyArtistDefs.ArtistViewDetailed
export type HandlerInput = undefined

export interface HandlerSuccess {
  encoding: 'application/json'
  body: OutputSchema
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
}

export type HandlerOutput = HandlerError | HandlerSuccess | HandlerPipeThrough
export type HandlerReqCtx<HA extends HandlerAuth = never> = {
  auth: HA
  params: QueryParams
  input: HandlerInput
  req: express.Request
  res: express.Response
  resetRouteRateLimits: () => Promise<void>
}
export type Handler<HA extends HandlerAuth = never> = (
  ctx: HandlerReqCtx<HA>,
) => Promise<HandlerOutput> | HandlerOutput
