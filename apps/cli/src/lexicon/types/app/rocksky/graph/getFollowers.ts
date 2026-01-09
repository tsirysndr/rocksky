/**
 * GENERATED CODE - DO NOT MODIFY
 */
import express from 'express'
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'
import { HandlerAuth, HandlerPipeThrough } from '@atproto/xrpc-server'
import * as AppRockskyActorDefs from '../actor/defs'

export interface QueryParams {
  actor: string
  limit: number
  /** If provided, filters the followers to only include those with DIDs in this list. */
  dids?: string[]
  cursor?: string
}

export type InputSchema = undefined

export interface OutputSchema {
  subject: AppRockskyActorDefs.ProfileViewBasic
  followers: AppRockskyActorDefs.ProfileViewBasic[]
  /** A cursor value to pass to subsequent calls to get the next page of results. */
  cursor?: string
  /** The total number of followers. */
  count?: number
  [k: string]: unknown
}

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
