//! R13 — subnet proxy: advertise a LAN CIDR, propagate to all peers.

use crate::peer::{gossip_round, PeerTable};
use crate::proto::PeerRecord;

/// Aggregated overlay routes learned from peer records.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RouteTable {
    routes: Vec<RouteEntry>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RouteEntry {
    pub cidr: String,
    pub via_origin: String,
    pub seq: u64,
}

impl RouteTable {
    pub fn new() -> Self {
        Self { routes: Vec::new() }
    }

    /// Rebuild from a converged peer table (each origin's advertised routes).
    pub fn sync_from_peers(table: &PeerTable) -> Self {
        let mut out = RouteTable::new();
        for rec in table.all() {
            for cidr in &rec.routes {
                out.upsert(RouteEntry {
                    cidr: cidr.clone(),
                    via_origin: rec.origin_key.clone(),
                    seq: rec.seq,
                });
            }
        }
        out
    }

    fn upsert(&mut self, entry: RouteEntry) {
        if let Some(existing) = self
            .routes
            .iter_mut()
            .find(|r| r.cidr == entry.cidr && r.via_origin == entry.via_origin)
        {
            if entry.seq >= existing.seq {
                *existing = entry;
            }
        } else {
            self.routes.push(entry);
        }
    }

    pub fn has_route(&self, cidr: &str) -> bool {
        self.routes.iter().any(|r| r.cidr == cidr)
    }

    pub fn via_origin(&self, cidr: &str) -> Option<&str> {
        self.routes
            .iter()
            .find(|r| r.cidr == cidr)
            .map(|r| r.via_origin.as_str())
    }

    pub fn all(&self) -> &[RouteEntry] {
        &self.routes
    }
}

fn record_with_route(key: &str, seq: u64, endpoint: &str, route: &str) -> PeerRecord {
    PeerRecord {
        origin_key: key.into(),
        seq,
        endpoints: vec![endpoint.into()],
        routes: if route.is_empty() {
            vec![]
        } else {
            vec![route.into()]
        },
    }
}

/// Three-node site-to-site test helper: node `a` advertises `lan_cidr`.
pub fn propagate_subnet_to_mesh(lan_cidr: &str) -> (PeerTable, PeerTable, PeerTable) {
    let mut nodes = [
        (
            &"a",
            record_with_route("a", 1, "10.0.0.1:51820", lan_cidr),
            PeerTable::new(),
        ),
        (
            &"b",
            record_with_route("b", 1, "10.0.0.2:51820", ""),
            PeerTable::new(),
        ),
        (
            &"c",
            record_with_route("c", 1, "10.0.0.3:51820", ""),
            PeerTable::new(),
        ),
    ];

    gossip_round(&mut nodes);
    let a = std::mem::take(&mut nodes[0].2);
    let b = std::mem::take(&mut nodes[1].2);
    let c = std::mem::take(&mut nodes[2].2);
    (a, b, c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subnet_propagates_to_three_nodes() {
        let lan = "192.168.1.0/24";
        let (a_table, b_table, c_table) = propagate_subnet_to_mesh(lan);

        for table in [&a_table, &b_table, &c_table] {
            let routes = RouteTable::sync_from_peers(table);
            assert!(
                routes.has_route(lan),
                "every node should install the advertised /24"
            );
            assert_eq!(routes.via_origin(lan), Some("a"));
        }
    }

    #[test]
    fn newer_advertisement_supersedes() {
        let mut table = PeerTable::new();
        table.merge(record_with_route("a", 1, "10.0.0.1:51820", "192.168.1.0/24"));
        table.merge(record_with_route("a", 2, "10.0.0.1:51820", "192.168.2.0/24"));
        let routes = RouteTable::sync_from_peers(&table);
        assert!(routes.has_route("192.168.2.0/24"));
    }
}
