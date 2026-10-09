use super::*;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::{collections::BTreeMap, net::IpAddr, time::Instant};

const SERVICE: &str = "_xbmc-jsonrpc-h._tcp.local.";
struct Discovery(ServiceDaemon);
impl Drop for Discovery {
    fn drop(&mut self) {
        let _ = self.0.stop_browse(SERVICE);
        let _ = self.0.shutdown();
    }
}
fn connection(info: &ServiceInfo) -> Option<Config> {
    if info.get_port() == 0 {
        return None;
    }
    let mut addresses: Vec<_> = info
        .get_addresses()
        .iter()
        .copied()
        .filter(|ip| {
            !ip.is_loopback()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && !matches!(ip, IpAddr::V6(v6) if (v6.segments()[0] & 0xffc0) == 0xfe80)
        })
        .collect();
    addresses.sort_by_key(|ip| (ip.is_ipv6(), *ip));
    let address = match addresses.first()? {
        IpAddr::V4(ip) => ip.to_string(),
        IpAddr::V6(ip) => format!("[{ip}]"),
    };
    Some(Config {
        kind: "kodi".into(),
        name: info
            .get_fullname()
            .strip_suffix(SERVICE)
            .unwrap_or("Kodi")
            .trim_end_matches('.')
            .to_owned(),
        base_url: format!("http://{address}:{}", info.get_port()),
        ..Config::default()
    })
}
pub fn discover() -> Result<Vec<Config>> {
    let daemon =
        Discovery(ServiceDaemon::new().map_err(|_| "Could not start Kodi network discovery")?);
    let receiver = daemon
        .0
        .browse(SERVICE)
        .map_err(|_| "Could not search for Kodi servers")?;
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut found = BTreeMap::new();
    while Instant::now() < deadline {
        if let Ok(ServiceEvent::ServiceResolved(info)) =
            receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
        {
            if let Some(config) = connection(&info) {
                found.insert(info.get_fullname().to_owned(), config);
            }
        }
    }
    Ok(found.into_values().collect())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolved_kodi_uses_advertised_http_port() {
        let info = ServiceInfo::new(
            SERVICE,
            "Living room",
            "kodi.local.",
            "192.168.1.20",
            8181,
            None,
        )
        .unwrap();
        let c = connection(&info).unwrap();
        assert_eq!(c.name, "Living room");
        assert_eq!(c.kind, "kodi");
        assert_eq!(c.base_url, "http://192.168.1.20:8181");
    }
    #[test]
    fn ignores_unreachable_loopback_service() {
        let info =
            ServiceInfo::new(SERVICE, "Kodi", "kodi.local.", "127.0.0.1", 8080, None).unwrap();
        assert!(connection(&info).is_none());
    }
}
