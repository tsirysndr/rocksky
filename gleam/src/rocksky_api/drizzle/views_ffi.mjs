import { pgTable, text, bigint, integer, timestamp } from 'drizzle-orm/pg-core';
// Existing materialized views, defined by the API's migrations.
export const views = Object.fromEntries(['tracks','artists'].map(kind => {
  const name=`chart_${kind}_mv`;
  const key=kind==='tracks' ? 'track_id' : 'artist_id';
  return [name,pgTable(name,{
    id:text(key), scrobbles:bigint('scrobbles',{mode:'number'}),
    uniqueListeners:bigint('unique_listeners',{mode:'number'}),
  })];
}));
views.scrobbles_per_day_mv = pgTable('scrobbles_per_day_mv', {
  day: text('day'), count: bigint('count',{mode:'number'}),
});

views.top_scrobblers_mv = pgTable('top_scrobblers_mv', {
  userId: text('user_id'), scrobbles: integer('scrobbles'),
  artists: integer('unique_artists'), tracks: integer('unique_tracks'),
});
views.user_hour_scrobbles_mv = pgTable('user_hour_scrobbles_mv', {
  userId: text('user_id'), hour: timestamp('hour'), scrobbles: integer('scrobbles'),
  artistKeys: integer('artist_keys').array(), trackKeys: integer('track_keys').array(),
});
views.user_artists_mv = pgTable('user_artists_mv', {
  userId: text('user_id'), artistId: text('artist_id'), playCount: integer('play_count'),
});
