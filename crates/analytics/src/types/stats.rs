use super::pagination::Pagination;

use chrono::{Datelike, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetStatsParams {
    pub user_did: String,
    pub pagination: Option<Pagination>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetScrobblesPerDayParams {
    pub user_did: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
}

impl Default for GetScrobblesPerDayParams {
    fn default() -> Self {
        let current_date = Utc::now().naive_utc();
        let date_30_days_ago = current_date - Duration::days(30);

        GetScrobblesPerDayParams {
            user_did: None,
            start: Some(date_30_days_ago.to_string()),
            end: Some(current_date.to_string()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetScrobblesPerMonthParams {
    pub user_did: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
}

impl Default for GetScrobblesPerMonthParams {
    fn default() -> Self {
        let current_date = Utc::now().naive_utc();
        let january = NaiveDate::from_ymd_opt(current_date.year(), 1, 1).unwrap();

        GetScrobblesPerMonthParams {
            user_did: None,
            start: Some(january.to_string()),
            end: Some(current_date.to_string()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetScrobblesPerYearParams {
    pub user_did: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
}

impl Default for GetScrobblesPerYearParams {
    fn default() -> Self {
        let current_date = Utc::now().naive_utc();
        let start = NaiveDate::from_ymd_opt(2025, 1, 1).unwrap();

        GetScrobblesPerYearParams {
            user_did: None,
            start: Some(start.to_string()),
            end: Some(current_date.to_string()),
        }
    }
}
