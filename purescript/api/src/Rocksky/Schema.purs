-- | Every table of the schema, re-exported, plus `<table>C = columns <table>`
-- | for building conditions: `import Rocksky.Schema as T` then `T.usersC.did`.
module Rocksky.Schema
  ( module Rocksky.Schema.AccessTokens
  , module Rocksky.Schema.AlbumTracks
  , module Rocksky.Schema.Albums
  , module Rocksky.Schema.ApiKeys
  , module Rocksky.Schema.ArtistAlbums
  , module Rocksky.Schema.ArtistTracks
  , module Rocksky.Schema.Artists
  , module Rocksky.Schema.DiscogsCredits
  , module Rocksky.Schema.DiscogsIdentifiers
  , module Rocksky.Schema.DiscogsMasters
  , module Rocksky.Schema.DiscogsReleaseArtists
  , module Rocksky.Schema.DiscogsReleaseLabels
  , module Rocksky.Schema.DiscogsReleases
  , module Rocksky.Schema.DiscogsSearches
  , module Rocksky.Schema.DiscogsTracks
  , module Rocksky.Schema.DropboxAccounts
  , module Rocksky.Schema.DropboxDirectories
  , module Rocksky.Schema.DropboxPaths
  , module Rocksky.Schema.DropboxTokens
  , module Rocksky.Schema.Dropbox
  , module Rocksky.Schema.EventArtists
  , module Rocksky.Schema.EventRsvps
  , module Rocksky.Schema.Events
  , module Rocksky.Schema.Feeds
  , module Rocksky.Schema.Follows
  , module Rocksky.Schema.GoogleDriveAccounts
  , module Rocksky.Schema.GoogleDriveDirectories
  , module Rocksky.Schema.GoogleDrivePaths
  , module Rocksky.Schema.GoogleDriveTokens
  , module Rocksky.Schema.GoogleDrive
  , module Rocksky.Schema.ImportJobs
  , module Rocksky.Schema.LovedTracks
  , module Rocksky.Schema.MirrorSources
  , module Rocksky.Schema.NavidromePlaylistTracks
  , module Rocksky.Schema.NavidromePlaylists
  , module Rocksky.Schema.Notifications
  , module Rocksky.Schema.PlaylistTracks
  , module Rocksky.Schema.Playlists
  , module Rocksky.Schema.ProfileShouts
  , module Rocksky.Schema.QueueTracks
  , module Rocksky.Schema.Scrobbles
  , module Rocksky.Schema.ShoutLikes
  , module Rocksky.Schema.ShoutReports
  , module Rocksky.Schema.Shouts
  , module Rocksky.Schema.SpotifyAccounts
  , module Rocksky.Schema.SpotifyApps
  , module Rocksky.Schema.SpotifyTokens
  , module Rocksky.Schema.Tracks
  , module Rocksky.Schema.UploadQueueState
  , module Rocksky.Schema.UserAlbums
  , module Rocksky.Schema.UserArtists
  , module Rocksky.Schema.UserPlaylists
  , module Rocksky.Schema.UserStorageProviders
  , module Rocksky.Schema.UserTracks
  , module Rocksky.Schema.UserUploads
  , module Rocksky.Schema.Users
  , module Rocksky.Schema.Webscrobblers
  , accessTokensC
  , albumTracksC
  , albumsC
  , apiKeysC
  , artistAlbumsC
  , artistTracksC
  , artistsC
  , discogsCreditsC
  , discogsIdentifiersC
  , discogsMastersC
  , discogsReleaseArtistsC
  , discogsReleaseLabelsC
  , discogsReleasesC
  , discogsSearchesC
  , discogsTracksC
  , dropboxAccountsC
  , dropboxDirectoriesC
  , dropboxPathsC
  , dropboxTokensC
  , dropboxC
  , eventArtistsC
  , eventRsvpsC
  , eventsC
  , feedsC
  , followsC
  , googleDriveAccountsC
  , googleDriveDirectoriesC
  , googleDrivePathsC
  , googleDriveTokensC
  , googleDriveC
  , importJobsC
  , lovedTracksC
  , mirrorSourcesC
  , navidromePlaylistTracksC
  , navidromePlaylistsC
  , notificationsC
  , playlistTracksC
  , playlistsC
  , profileShoutsC
  , queueTracksC
  , scrobblesC
  , shoutLikesC
  , shoutReportsC
  , shoutsC
  , spotifyAccountsC
  , spotifyAppsC
  , spotifyTokensC
  , tracksC
  , uploadQueueStateC
  , userAlbumsC
  , userArtistsC
  , userPlaylistsC
  , userStorageProvidersC
  , userTracksC
  , userUploadsC
  , usersC
  , webscrobblersC
  ) where

import Drizzle.Schema (columns)
import Rocksky.Schema.AccessTokens (accessTokens, AccessTokensCols, SelectAccessToken)
import Rocksky.Schema.AlbumTracks (albumTracks, AlbumTracksCols, SelectAlbumTrack)
import Rocksky.Schema.Albums (albums, AlbumsCols, SelectAlbum)
import Rocksky.Schema.ApiKeys (apiKeys, ApiKeysCols, SelectApiKey)
import Rocksky.Schema.ArtistAlbums (artistAlbums, ArtistAlbumsCols, SelectArtistAlbum)
import Rocksky.Schema.ArtistTracks (artistTracks, ArtistTracksCols, SelectArtistTrack)
import Rocksky.Schema.Artists (artists, ArtistsCols, SelectArtist)
import Rocksky.Schema.DiscogsCredits (discogsCredits, DiscogsCreditsCols, SelectDiscogsCredit)
import Rocksky.Schema.DiscogsIdentifiers (discogsIdentifiers, DiscogsIdentifiersCols, SelectDiscogsIdentifier)
import Rocksky.Schema.DiscogsMasters (discogsMasters, DiscogsMastersCols, SelectDiscogsMaster)
import Rocksky.Schema.DiscogsReleaseArtists (discogsReleaseArtists, DiscogsReleaseArtistsCols, SelectDiscogsReleaseArtist)
import Rocksky.Schema.DiscogsReleaseLabels (discogsReleaseLabels, DiscogsReleaseLabelsCols, SelectDiscogsReleaseLabel)
import Rocksky.Schema.DiscogsReleases (discogsReleases, DiscogsReleasesCols, SelectDiscogsRelease)
import Rocksky.Schema.DiscogsSearches (discogsSearches, DiscogsSearchesCols, SelectDiscogsSearch)
import Rocksky.Schema.DiscogsTracks (discogsTracks, DiscogsTracksCols, SelectDiscogsTrack)
import Rocksky.Schema.DropboxAccounts (dropboxAccounts, DropboxAccountsCols, SelectDropboxAccounts)
import Rocksky.Schema.DropboxDirectories (dropboxDirectories, DropboxDirectoriesCols, SelectDropboxDirectories)
import Rocksky.Schema.DropboxPaths (dropboxPaths, DropboxPathsCols, SelectDropboxPaths)
import Rocksky.Schema.DropboxTokens (dropboxTokens, DropboxTokensCols, SelectDropboxToken)
import Rocksky.Schema.Dropbox (dropbox, DropboxCols, SelectDropbox)
import Rocksky.Schema.EventArtists (eventArtists, EventArtistsCols, SelectEventArtist)
import Rocksky.Schema.EventRsvps (eventRsvps, EventRsvpsCols, SelectEventRsvp)
import Rocksky.Schema.Events (events, EventsCols, SelectEvent)
import Rocksky.Schema.Feeds (feeds, FeedsCols, SelectFeed)
import Rocksky.Schema.Follows (follows, FollowsCols, SelectFollows)
import Rocksky.Schema.GoogleDriveAccounts (googleDriveAccounts, GoogleDriveAccountsCols, SelectGoogleDriveAccounts)
import Rocksky.Schema.GoogleDriveDirectories (googleDriveDirectories, GoogleDriveDirectoriesCols, SelectGoogleDriveDirectories)
import Rocksky.Schema.GoogleDrivePaths (googleDrivePaths, GoogleDrivePathsCols, SelectGoogleDrivePaths)
import Rocksky.Schema.GoogleDriveTokens (googleDriveTokens, GoogleDriveTokensCols, SelectGoogleDriveToken)
import Rocksky.Schema.GoogleDrive (googleDrive, GoogleDriveCols, SelectGoogleDrive)
import Rocksky.Schema.ImportJobs (importJobs, ImportJobsCols, SelectImportJob)
import Rocksky.Schema.LovedTracks (lovedTracks, LovedTracksCols, SelectLovedTrack)
import Rocksky.Schema.MirrorSources (mirrorSources, MirrorSourcesCols, SelectMirrorSource)
import Rocksky.Schema.NavidromePlaylistTracks (navidromePlaylistTracks, NavidromePlaylistTracksCols, SelectNavidromePlaylistTrack)
import Rocksky.Schema.NavidromePlaylists (navidromePlaylists, NavidromePlaylistsCols, SelectNavidromePlaylist)
import Rocksky.Schema.Notifications (notifications, NotificationsCols, SelectNotification)
import Rocksky.Schema.PlaylistTracks (playlistTracks, PlaylistTracksCols, SelectPlaylistTrack)
import Rocksky.Schema.Playlists (playlists, PlaylistsCols, SelectPlaylist)
import Rocksky.Schema.ProfileShouts (profileShouts, ProfileShoutsCols, SelectProfileShout)
import Rocksky.Schema.QueueTracks (queueTracks, QueueTracksCols, SelectQueueTrack)
import Rocksky.Schema.Scrobbles (scrobbles, ScrobblesCols, SelectScrobble)
import Rocksky.Schema.ShoutLikes (shoutLikes, ShoutLikesCols, SelectShoutLike)
import Rocksky.Schema.ShoutReports (shoutReports, ShoutReportsCols, SelectShoutReport)
import Rocksky.Schema.Shouts (shouts, ShoutsCols, SelectShout)
import Rocksky.Schema.SpotifyAccounts (spotifyAccounts, SpotifyAccountsCols, SelectSpotifyAccount)
import Rocksky.Schema.SpotifyApps (spotifyApps, SpotifyAppsCols, SelectSpotifyApp)
import Rocksky.Schema.SpotifyTokens (spotifyTokens, SpotifyTokensCols, SelectSpotifyToken)
import Rocksky.Schema.Tracks (tracks, TracksCols, SelectTrack)
import Rocksky.Schema.UploadQueueState (uploadQueueState, UploadQueueStateCols, SelectUploadQueueState)
import Rocksky.Schema.UserAlbums (userAlbums, UserAlbumsCols, SelectUserAlbum)
import Rocksky.Schema.UserArtists (userArtists, UserArtistsCols, SelectUserArtist)
import Rocksky.Schema.UserPlaylists (userPlaylists, UserPlaylistsCols, SelectUserPlaylist)
import Rocksky.Schema.UserStorageProviders (userStorageProviders, UserStorageProvidersCols, SelectUserStorageProvider)
import Rocksky.Schema.UserTracks (userTracks, UserTracksCols, SelectUserTrack)
import Rocksky.Schema.UserUploads (userUploads, UserUploadsCols, SelectUserUpload)
import Rocksky.Schema.Users (users, UsersCols, SelectUser)
import Rocksky.Schema.Webscrobblers (webscrobblers, WebscrobblersCols, SelectWebscrobblers)

accessTokensC :: Record AccessTokensCols
accessTokensC = columns accessTokens

albumTracksC :: Record AlbumTracksCols
albumTracksC = columns albumTracks

albumsC :: Record AlbumsCols
albumsC = columns albums

apiKeysC :: Record ApiKeysCols
apiKeysC = columns apiKeys

artistAlbumsC :: Record ArtistAlbumsCols
artistAlbumsC = columns artistAlbums

artistTracksC :: Record ArtistTracksCols
artistTracksC = columns artistTracks

artistsC :: Record ArtistsCols
artistsC = columns artists

discogsCreditsC :: Record DiscogsCreditsCols
discogsCreditsC = columns discogsCredits

discogsIdentifiersC :: Record DiscogsIdentifiersCols
discogsIdentifiersC = columns discogsIdentifiers

discogsMastersC :: Record DiscogsMastersCols
discogsMastersC = columns discogsMasters

discogsReleaseArtistsC :: Record DiscogsReleaseArtistsCols
discogsReleaseArtistsC = columns discogsReleaseArtists

discogsReleaseLabelsC :: Record DiscogsReleaseLabelsCols
discogsReleaseLabelsC = columns discogsReleaseLabels

discogsReleasesC :: Record DiscogsReleasesCols
discogsReleasesC = columns discogsReleases

discogsSearchesC :: Record DiscogsSearchesCols
discogsSearchesC = columns discogsSearches

discogsTracksC :: Record DiscogsTracksCols
discogsTracksC = columns discogsTracks

dropboxAccountsC :: Record DropboxAccountsCols
dropboxAccountsC = columns dropboxAccounts

dropboxDirectoriesC :: Record DropboxDirectoriesCols
dropboxDirectoriesC = columns dropboxDirectories

dropboxPathsC :: Record DropboxPathsCols
dropboxPathsC = columns dropboxPaths

dropboxTokensC :: Record DropboxTokensCols
dropboxTokensC = columns dropboxTokens

dropboxC :: Record DropboxCols
dropboxC = columns dropbox

eventArtistsC :: Record EventArtistsCols
eventArtistsC = columns eventArtists

eventRsvpsC :: Record EventRsvpsCols
eventRsvpsC = columns eventRsvps

eventsC :: Record EventsCols
eventsC = columns events

feedsC :: Record FeedsCols
feedsC = columns feeds

followsC :: Record FollowsCols
followsC = columns follows

googleDriveAccountsC :: Record GoogleDriveAccountsCols
googleDriveAccountsC = columns googleDriveAccounts

googleDriveDirectoriesC :: Record GoogleDriveDirectoriesCols
googleDriveDirectoriesC = columns googleDriveDirectories

googleDrivePathsC :: Record GoogleDrivePathsCols
googleDrivePathsC = columns googleDrivePaths

googleDriveTokensC :: Record GoogleDriveTokensCols
googleDriveTokensC = columns googleDriveTokens

googleDriveC :: Record GoogleDriveCols
googleDriveC = columns googleDrive

importJobsC :: Record ImportJobsCols
importJobsC = columns importJobs

lovedTracksC :: Record LovedTracksCols
lovedTracksC = columns lovedTracks

mirrorSourcesC :: Record MirrorSourcesCols
mirrorSourcesC = columns mirrorSources

navidromePlaylistTracksC :: Record NavidromePlaylistTracksCols
navidromePlaylistTracksC = columns navidromePlaylistTracks

navidromePlaylistsC :: Record NavidromePlaylistsCols
navidromePlaylistsC = columns navidromePlaylists

notificationsC :: Record NotificationsCols
notificationsC = columns notifications

playlistTracksC :: Record PlaylistTracksCols
playlistTracksC = columns playlistTracks

playlistsC :: Record PlaylistsCols
playlistsC = columns playlists

profileShoutsC :: Record ProfileShoutsCols
profileShoutsC = columns profileShouts

queueTracksC :: Record QueueTracksCols
queueTracksC = columns queueTracks

scrobblesC :: Record ScrobblesCols
scrobblesC = columns scrobbles

shoutLikesC :: Record ShoutLikesCols
shoutLikesC = columns shoutLikes

shoutReportsC :: Record ShoutReportsCols
shoutReportsC = columns shoutReports

shoutsC :: Record ShoutsCols
shoutsC = columns shouts

spotifyAccountsC :: Record SpotifyAccountsCols
spotifyAccountsC = columns spotifyAccounts

spotifyAppsC :: Record SpotifyAppsCols
spotifyAppsC = columns spotifyApps

spotifyTokensC :: Record SpotifyTokensCols
spotifyTokensC = columns spotifyTokens

tracksC :: Record TracksCols
tracksC = columns tracks

uploadQueueStateC :: Record UploadQueueStateCols
uploadQueueStateC = columns uploadQueueState

userAlbumsC :: Record UserAlbumsCols
userAlbumsC = columns userAlbums

userArtistsC :: Record UserArtistsCols
userArtistsC = columns userArtists

userPlaylistsC :: Record UserPlaylistsCols
userPlaylistsC = columns userPlaylists

userStorageProvidersC :: Record UserStorageProvidersCols
userStorageProvidersC = columns userStorageProviders

userTracksC :: Record UserTracksCols
userTracksC = columns userTracks

userUploadsC :: Record UserUploadsCols
userUploadsC = columns userUploads

usersC :: Record UsersCols
usersC = columns users

webscrobblersC :: Record WebscrobblersCols
webscrobblersC = columns webscrobblers
