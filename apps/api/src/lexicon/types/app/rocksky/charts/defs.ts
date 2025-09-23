/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'

export interface ChartsView {
  scrobbles?: ScrobbleViewBasic[]
  [k: string]: unknown
}

export function isChartsView(v: unknown): v is ChartsView {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.charts.defs#chartsView'
  )
}

export function validateChartsView(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.charts.defs#chartsView', v)
}

export interface ScrobbleViewBasic {
  /** The date of the scrobble. */
  date?: string
  /** The number of scrobbles on this date. */
  count?: number
  [k: string]: unknown
}

export function isScrobbleViewBasic(v: unknown): v is ScrobbleViewBasic {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.charts.defs#scrobbleViewBasic'
  )
}

export function validateScrobbleViewBasic(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.charts.defs#scrobbleViewBasic', v)
}
