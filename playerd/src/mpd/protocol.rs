use std::ops::Range;
#[derive(Debug)]
pub struct Error {
    pub code: u8,
    pub message: String,
}
pub type Result<T> = std::result::Result<T, Error>;
impl Error {
    pub fn argument(message: impl Into<String>) -> Self {
        Self {
            code: 2,
            message: message.into(),
        }
    }
    pub fn missing(message: impl Into<String>) -> Self {
        Self {
            code: 50,
            message: message.into(),
        }
    }
    pub fn system() -> Self {
        Self {
            code: 52,
            message: "Operation failed; see playerd log".into(),
        }
    }
    pub fn ack(&self, command: &str, index: usize) -> String {
        format!(
            "ACK [{}@{}] {{{}}} {}\n",
            self.code,
            index,
            clean(command),
            clean(&self.message)
        )
    }
}
pub fn clean(s: &str) -> String {
    s.replace(['\r', '\n'], " ")
}
pub fn kv(key: &str, value: impl std::fmt::Display) -> String {
    format!("{key}: {}\n", clean(&value.to_string()))
}
pub fn tokens(line: &str) -> Result<Vec<String>> {
    let mut out = Vec::new();
    let mut chars = line.trim_end_matches('\r').chars().peekable();
    while chars.peek().is_some() {
        while chars.peek().is_some_and(|c| c.is_ascii_whitespace()) {
            chars.next();
        }
        if chars.peek().is_none() {
            break;
        }
        let mut value = String::new();
        let quoted = chars.peek() == Some(&'"');
        if quoted {
            chars.next();
        }
        let mut closed = !quoted;
        while let Some(c) = chars.next() {
            if quoted && c == '"' {
                closed = true;
                break;
            }
            if !quoted && c.is_ascii_whitespace() {
                break;
            }
            if c == '\\' {
                value.push(
                    chars
                        .next()
                        .ok_or_else(|| Error::argument("trailing escape"))?,
                );
            } else {
                value.push(c);
            }
        }
        if !closed {
            return Err(Error::argument("unterminated quote"));
        }
        if quoted && chars.peek().is_some_and(|c| !c.is_ascii_whitespace()) {
            return Err(Error::argument("expected argument separator"));
        }
        out.push(value);
    }
    Ok(out)
}
pub fn arity(args: &[String], min: usize, max: usize) -> Result<()> {
    if args.len() < min || args.len() > max {
        Err(Error::argument("incorrect number of arguments"))
    } else {
        Ok(())
    }
}
pub fn number(s: &str) -> Result<usize> {
    s.parse()
        .map_err(|_| Error::argument("expected nonnegative integer"))
}
pub fn boolean(s: &str) -> Result<bool> {
    match s {
        "0" => Ok(false),
        "1" => Ok(true),
        _ => Err(Error::argument("expected 0 or 1")),
    }
}
pub fn seconds(s: &str) -> Result<f64> {
    let n: f64 = s.parse().map_err(|_| Error::argument("invalid time"))?;
    if !n.is_finite() || n.abs() > 1e12 {
        return Err(Error::argument("invalid time"));
    }
    Ok(n)
}
pub fn range(s: &str, len: usize) -> Result<Range<usize>> {
    let (start, end) = match s.split_once(':') {
        Some((s, e)) => (number(s)?, if e.is_empty() { len } else { number(e)? }),
        None => {
            let i = number(s)?;
            (
                i,
                i.checked_add(1)
                    .ok_or_else(|| Error::argument("invalid range"))?,
            )
        }
    };
    if start > end || end > len {
        Err(Error::missing("queue range does not exist"))
    } else {
        Ok(start..end)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quoting_and_strict_errors() {
        assert_eq!(
            tokens(r#"add "https://x/a b\"c\\d""#).unwrap(),
            vec!["add", "https://x/a b\"c\\d"]
        );
        assert!(tokens("add \"bad").is_err());
        assert!(tokens("add \"a\"b").is_err());
    }
    #[test]
    fn ranges_and_ack() {
        assert_eq!(range("1:", 3).unwrap(), 1..3);
        assert!(range("3", 3).is_err());
        assert!(seconds("NaN").is_err());
        assert_eq!(
            Error::missing("gone\nno").ack("delete", 2),
            "ACK [50@2] {delete} gone no\n"
        );
    }
}
