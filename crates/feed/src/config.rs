use std::env;

use dotenv::dotenv;

#[derive(Debug, Clone)]
/// Configuration values for a Feed service
pub struct Config {
    /// Your account's decentralized identifier (DID)
    /// A DID is a persistent, long-term identifier for every account. Usually look like did:plc:ewvi7nxzyoun6zhxrhs64oiz.
    pub publisher_did: String,
    /// The host name for your feed generator.
    ///
    /// For example: if github were to host a feed generator service at their domain they would set this value to `github.com`
    ///
    /// You can develop your feed locally without setting this to a real value. However, when publishing, this value must be a domain that:
    /// - Points to your service.
    /// - Is secured with SSL (HTTPS).
    /// - Is accessible on the public internet.
    pub feed_generator_hostname: String,
}

impl Config {
    /// Loads the config from a local .env file containing these variables
    /// PUBLISHER_DID
    /// FEED_GENERATOR_HOSTNAME
    pub fn load_env_config() -> Self {
        dotenv().expect("Missing .env");
        Config {
            publisher_did: env::var("PUBLISHER_DID")
                .expect(".env file is missing an entry for PUBLISHER_DID"),
            feed_generator_hostname: env::var("FEED_GENERATOR_HOSTNAME")
                .expect(".env file is missing an entry for FEED_GENERATOR_HOSTNAME"),
        }
    }
}
