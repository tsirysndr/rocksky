use std::collections::BTreeMap;

pub fn generate_signature(params: &BTreeMap<String, String>, secret: &str) -> String {
    let base_string: String = params
        .iter()
        .filter(|(k, _)| k.as_str() != "api_sig" && k.as_str() != "format")
        .map(|(k, v)| format!("{}{}", k, v))
        .collect::<Vec<String>>()
        .join("");

    let combined = format!("{}{}", base_string, secret);
    format!("{:x}", md5::compute(combined))
}
