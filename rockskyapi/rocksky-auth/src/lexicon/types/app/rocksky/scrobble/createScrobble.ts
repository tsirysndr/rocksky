/**
 * GENERATED CODE - DO NOT MODIFY
 */
import express from 'express'
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'
import { HandlerAuth, HandlerPipeThrough } from '@atproto/xrpc-server'
import * as AppRockskyScrobbleDefs from './defs'

export interface QueryParams {}

export interface InputSchema {
  /** The title of the track being scrobbled */
  title: string
  /** The artist of the track being scrobbled */
  artist: string
  /** The album of the track being scrobbled */
  album?: string
  /** The duration of the track in seconds */
  duration?: number
  /** The timestamp of the scrobble in milliseconds since epoch */
  timestamp?: number
  [k: string]: unknown
}

export type OutputSchema = AppRockskyScrobbleDefs.ScrobbleViewBasic

export interface HandlerInput {
  encoding: 'application/json'
  body: InputSchema
}

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
