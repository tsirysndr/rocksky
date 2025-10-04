extern crate duckdb;
extern crate r2d2;

use duckdb::{params, Connection, Error};
use std::path::{Path, PathBuf};

enum ConnectionConfig {
    File(PathBuf),
    Memory,
}

/// An `r2d2::ManageConnection` for `ruDuckDB::Connection`s.
pub struct DuckDBConnectionManager(ConnectionConfig);

impl DuckDBConnectionManager {
    /// Creates a new `DuckDBConnectionManager` from file.
    ///
    pub fn file<P: AsRef<Path>>(path: P) -> Self {
        DuckDBConnectionManager(ConnectionConfig::File(path.as_ref().to_path_buf()))
    }

    pub fn memory() -> Self {
        DuckDBConnectionManager(ConnectionConfig::Memory)
    }
}

impl r2d2::ManageConnection for DuckDBConnectionManager {
    type Connection = Connection;
    type Error = duckdb::Error;

    fn connect(&self) -> Result<Connection, Error> {
        match self.0 {
            ConnectionConfig::File(ref path) => Connection::open(path),
            ConnectionConfig::Memory => Connection::open_in_memory(),
        }
    }

    fn is_valid(&self, conn: &mut Connection) -> Result<(), Error> {
        let _ = conn.execute("", params![]);
        Ok(())
    }

    fn has_broken(&self, _: &mut Connection) -> bool {
        false
    }
}
