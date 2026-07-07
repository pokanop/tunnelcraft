//! R14 — UPnP IGD port mapping as a traversal aid (companion to R12 relay fallback).
//!
//! Production code uses [`igd-next`](https://docs.rs/igd-next); tests use [`MockGateway`].

use std::net::{Ipv4Addr, SocketAddrV4};
use std::time::Duration;

/// One requested port mapping on the local router.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PortMapping {
    pub protocol: &'static str,
    pub internal_port: u16,
    pub external_port: u16,
    pub internal_addr: Ipv4Addr,
    pub description: String,
    pub lease: Duration,
}

/// Gateway trait — implemented by `MockGateway` in tests and `igd-next` in production.
pub trait Gateway {
    fn add_port_mapping(&mut self, mapping: PortMapping) -> Result<SocketAddrV4, UpnpError>;
    fn mappings(&self) -> &[PortMapping];
}

#[derive(Debug, PartialEq, Eq)]
pub enum UpnpError {
    GatewayUnavailable,
    MappingRejected,
}

impl std::fmt::Display for UpnpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::GatewayUnavailable => write!(f, "no UPnP IGD found on the LAN"),
            Self::MappingRejected => write!(f, "router rejected AddPortMapping"),
        }
    }
}

impl std::error::Error for UpnpError {}

/// High-level helper matching the `igd-next` call pattern from the S03 lesson.
pub struct UpnpMapper {
    pub local_addr: Ipv4Addr,
    pub local_port: u16,
    pub description: String,
}

impl UpnpMapper {
    pub fn open_udp_traversal_port<G: Gateway>(
        &self,
        gw: &mut G,
        lease: Duration,
    ) -> Result<SocketAddrV4, UpnpError> {
        gw.add_port_mapping(PortMapping {
            protocol: "UDP",
            internal_port: self.local_port,
            external_port: self.local_port,
            internal_addr: self.local_addr,
            description: self.description.clone(),
            lease,
        })
    }
}

/// In-memory IGD for CI — records mappings so tests can verify without a router.
#[derive(Clone, Debug)]
pub struct MockGateway {
    pub external_ip: Ipv4Addr,
    mappings: Vec<PortMapping>,
}

impl Default for MockGateway {
    fn default() -> Self {
        Self {
            external_ip: Ipv4Addr::UNSPECIFIED,
            mappings: Vec::new(),
        }
    }
}

impl MockGateway {
    pub fn with_external_ip(ip: Ipv4Addr) -> Self {
        Self {
            external_ip: ip,
            mappings: Vec::new(),
        }
    }
}

impl Gateway for MockGateway {
    fn add_port_mapping(&mut self, mapping: PortMapping) -> Result<SocketAddrV4, UpnpError> {
        if mapping.external_port == 0 {
            return Err(UpnpError::MappingRejected);
        }
        let addr = SocketAddrV4::new(self.external_ip, mapping.external_port);
        self.mappings.push(mapping);
        Ok(addr)
    }

    fn mappings(&self) -> &[PortMapping] {
        &self.mappings
    }
}

/// Verify a mapping was installed (what learners assert after `igd-next` succeeds).
pub fn verify_port_mapping(gw: &MockGateway, internal_port: u16) -> bool {
    gw.mappings()
        .iter()
        .any(|m| m.internal_port == internal_port && m.protocol == "UDP")
}

/// Production sketch — uncomment `igd-next` in your own client crate:
///
/// ```ignore
/// use igd_next::aio::tokio::Gateway;
/// use igd_next::PortMappingProtocol;
///
/// let gateway = Gateway::discover().await?;
/// gateway
///     .add_port(PortMappingProtocol::UDP, local_port, local_port, lease_secs, "tunnelcraft")
///     .await?;
/// ```
pub fn production_igd_next_sketch() -> &'static str {
    "igd-next: Gateway::discover → add_port(UDP, internal, external, lease, desc)"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_upnp_port_and_verifies() {
        let mut gw = MockGateway::with_external_ip(Ipv4Addr::new(203, 0, 113, 10));
        let mapper = UpnpMapper {
            local_addr: Ipv4Addr::new(192, 168, 1, 50),
            local_port: 51820,
            description: "tunnelcraft-capstone".into(),
        };
        let external = mapper
            .open_udp_traversal_port(&mut gw, Duration::from_secs(3600))
            .unwrap();
        assert_eq!(external.port(), 51820);
        assert!(verify_port_mapping(&gw, 51820));
        assert_eq!(gw.mappings().len(), 1);
        assert_eq!(gw.mappings()[0].protocol, "UDP");
    }

    #[test]
    fn rejects_invalid_mapping() {
        let mut gw = MockGateway::default();
        let err = gw.add_port_mapping(PortMapping {
            protocol: "UDP",
            internal_port: 1,
            external_port: 0,
            internal_addr: Ipv4Addr::LOCALHOST,
            description: "bad".into(),
            lease: Duration::from_secs(60),
        });
        assert_eq!(err, Err(UpnpError::MappingRejected));
    }
}
