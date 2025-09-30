use super::Repo;

pub mod album;
pub mod artist;
pub mod scrobble;
pub mod track;
pub mod user;

pub struct DuckdbRepo {}

impl Repo for DuckdbRepo {
    fn insert_album() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn insert_artist() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn insert_scrobble() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn insert_track() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn insert_user() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn get_albums() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn get_artists() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn get_scrobbles() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn get_tracks() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn get_users() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn get_album() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn get_artist() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn get_track() -> Result<(), anyhow::Error> {
        todo!()
    }

    fn get_user() -> Result<(), anyhow::Error> {
        todo!()
    }
}
