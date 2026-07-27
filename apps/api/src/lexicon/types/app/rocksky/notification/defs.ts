/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

/** The user who triggered a notification. */
export interface NotificationActor {
  /** The unique identifier of the actor. */
  id?: string;
  /** The decentralized identifier of the actor. */
  did?: string;
  /** The handle of the actor. */
  handle?: string;
  /** The display name of the actor. */
  displayName?: string;
  /** The URL of the actor's avatar image. */
  avatar?: string;
  [k: string]: unknown;
}

export function isNotificationActor(v: unknown): v is NotificationActor {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.notification.defs#notificationActor"
  );
}

export function validateNotificationActor(v: unknown): ValidationResult {
  return lexicons.validate(
    "app.rocksky.notification.defs#notificationActor",
    v,
  );
}

export interface NotificationView {
  /** The unique identifier of the notification. */
  id: string;
  /** The notification type: like_scrobble, follow, comment_scrobble, comment_profile, reply, or react_comment. */
  type:
    | "like_scrobble"
    | "follow"
    | "comment_scrobble"
    | "comment_profile"
    | "reply"
    | "react_comment"
    | (string & {});
  /** Whether the notification has been viewed. */
  read: boolean;
  /** When the notification was created. */
  createdAt: string;
  /** The at-uri of the subject the notification relates to. */
  subjectUri?: string;
  /** The id of the related shout, if any. */
  shoutId?: string;
  /** The content of the related shout, if any. */
  shoutContent?: string;
  actor?: NotificationActor;
  subject?: SubjectView;
  [k: string]: unknown;
}

export function isNotificationView(v: unknown): v is NotificationView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.notification.defs#notificationView"
  );
}

export function validateNotificationView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.notification.defs#notificationView", v);
}

/** The song, album, or scrobble a notification relates to, for rich display. */
export interface SubjectView {
  /** The at-uri of the subject. */
  uri: string;
  /** The title of the track or album. */
  title?: string;
  /** The artist of the track or album. */
  artist?: string;
  /** The album art image URL. */
  albumArt?: string;
  [k: string]: unknown;
}

export function isSubjectView(v: unknown): v is SubjectView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.notification.defs#subjectView"
  );
}

export function validateSubjectView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.notification.defs#subjectView", v);
}
