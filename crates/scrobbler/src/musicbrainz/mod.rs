use anyhow::Error;
pub mod artist;
pub mod label;
pub mod recording;
pub mod release;

pub fn normalize_date(d: Option<&str>) -> Result<Option<String>, Error> {
    if let Some(d) = d {
        let mut parts = d.split('-');
        let y = parts.next().unwrap_or("9999");
        let m = parts.next().unwrap_or("01");
        let day = parts.next().unwrap_or("01");

        let y: i32 = y.parse().unwrap_or(9999);
        let m: i32 = m.parse().unwrap_or(1);
        let day: i32 = day.parse().unwrap_or(1);

        if y == 9999 {
            return Err(Error::msg("Invalid date"));
        }

        return Ok(Some(format!("{:04}-{:02}-{:02}", y, m, day)));
    }
    Ok(None)
}
