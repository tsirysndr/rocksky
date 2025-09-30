use anyhow::Error;

pub mod duckdb;
pub mod postgres;

pub trait Repo {
    fn insert_album() -> Result<(), Error>;
    fn insert_artist() -> Result<(), Error>;
    fn insert_scrobble() -> Result<(), Error>;
    fn insert_track() -> Result<(), Error>;
    fn insert_user() -> Result<(), Error>;
    fn get_albums() -> Result<(), Error>;
    fn get_artists() -> Result<(), Error>;
    fn get_scrobbles() -> Result<(), Error>;
    fn get_tracks() -> Result<(), Error>;
    fn get_users() -> Result<(), Error>;
    fn get_album() -> Result<(), Error>;
    fn get_artist() -> Result<(), Error>;
    fn get_track() -> Result<(), Error>;
    fn get_user() -> Result<(), Error>;
}
