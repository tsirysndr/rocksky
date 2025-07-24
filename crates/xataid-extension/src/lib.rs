use pgrx::prelude::*;

::pgrx::pg_module_magic!(name, version);

fn generate_xata_id() -> String {
    format!("rec_{}", xid::new())
}

#[pg_extern]
fn xata_id() -> String {
    generate_xata_id()
}

#[cfg(any(test, feature = "pg_test"))]
#[pg_schema]
mod tests {
    use pgrx::prelude::*;

    #[pg_test]
    fn test_xata_id_length_and_prefix() {
        let id = crate::generate_xata_id();
        assert_eq!(id.len(), 24, "ID length should be 24");
        assert!(id.starts_with("rec_"), "ID should start with 'rec_'");
    }

    #[pg_test]
    fn test_xata_id_valid_characters() {
        let id = crate::generate_xata_id();
        let random_part = &id[4..];
        for c in random_part.chars() {
            assert!(
                c.is_ascii_lowercase() || c.is_ascii_digit(),
                "Invalid character in random part: {}",
                c
            );
        }
    }

    #[pg_test]
    fn test_xata_id_uniqueness() {
        let id1 = crate::generate_xata_id();
        let id2 = crate::generate_xata_id();
        assert_ne!(id1, id2, "IDs should be unique");
    }

    #[pg_test]
    fn test_xata_id_multiple() {
        for _ in 0..100 {
            let id = crate::generate_xata_id();
            assert_eq!(id.len(), 24, "ID length should be 24");
            assert!(id.starts_with("rec_"), "ID should start with 'rec_'");
            for c in id[4..].chars() {
                assert!(
                    c.is_ascii_lowercase() || c.is_ascii_digit(),
                    "Invalid character: {}",
                    c
                );
            }
        }
    }
}

#[cfg(test)]
pub mod pg_test {
    pub fn setup(_options: Vec<&str>) {
        // No initialization needed
    }

    pub fn postgresql_conf_options() -> Vec<&'static str> {
        vec![]
    }
}
