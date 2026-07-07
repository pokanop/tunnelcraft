//! R11 — peer table sync via framed protobuf gossip (T05 peer-exchange protocol).

use crate::frame::{decode_frame, encode_frame};
use crate::proto::PeerRecord;

pub type NodeId = &'static str;

/// Per-node view of the mesh peer table (highest seq per origin wins).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PeerTable {
    records: Vec<PeerRecord>,
}

impl PeerTable {
    pub fn new() -> Self {
        Self { records: Vec::new() }
    }

    pub fn merge(&mut self, incoming: PeerRecord) -> bool {
        if let Some(existing) = self
            .records
            .iter_mut()
            .find(|r| r.origin_key == incoming.origin_key)
        {
            if incoming.seq > existing.seq {
                *existing = incoming;
                return true;
            }
            false
        } else {
            self.records.push(incoming);
            true
        }
    }

    pub fn get(&self, origin: &str) -> Option<&PeerRecord> {
        self.records.iter().find(|r| r.origin_key == origin)
    }

    pub fn all(&self) -> &[PeerRecord] {
        &self.records
    }

    /// Serialize every known record as independent framed messages (broadcast batch).
    pub fn export_frames(&self) -> Vec<Vec<u8>> {
        self.records
            .iter()
            .map(|r| encode_frame(&r.encode()).expect("record encodes"))
            .collect()
    }

    /// Import framed protobuf records from a peer.
    pub fn import_frames(&mut self, wire: &[u8]) -> usize {
        let mut offset = 0;
        let mut merged = 0;
        while offset < wire.len() {
            let (payload, n) = decode_frame(&wire[offset..]).expect("valid frame in test");
            offset += n;
            let rec = PeerRecord::decode(payload).expect("valid record in test");
            if self.merge(rec) {
                merged += 1;
            }
        }
        merged
    }
}

/// One gossip round: each node broadcasts its own record to every other node.
pub fn gossip_round(nodes: &mut [(&NodeId, PeerRecord, PeerTable)]) -> usize {
    let frames: Vec<(NodeId, Vec<u8>)> = nodes
        .iter()
        .map(|(id, rec, _)| {
            let frame = encode_frame(&rec.encode()).expect("encode");
            (**id, frame)
        })
        .collect();

    let mut updates = 0;
    for (receiver_id, _, table) in nodes.iter_mut() {
        for (sender_id, frame) in &frames {
            if *sender_id == **receiver_id {
                continue;
            }
            updates += table.import_frames(frame);
        }
    }
    updates
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(key: &str, seq: u64, endpoints: &[&str]) -> PeerRecord {
        PeerRecord {
            origin_key: key.into(),
            seq,
            endpoints: endpoints.iter().map(|s| (*s).into()).collect(),
            routes: vec![],
        }
    }

    #[test]
    fn three_nodes_converge() {
        let a_rec = record("a", 1, &["10.0.0.1:51820"]);
        let b_rec = record("b", 1, &["10.0.0.2:51820"]);
        let c_rec = record("c", 1, &["10.0.0.3:51820"]);

        let mut nodes = [
            (&"a", a_rec, PeerTable::new()),
            (&"b", b_rec, PeerTable::new()),
            (&"c", c_rec, PeerTable::new()),
        ];

        gossip_round(&mut nodes);
        for (_, _, table) in &nodes {
            assert!(table.get("a").is_some());
            assert!(table.get("b").is_some());
            assert!(table.get("c").is_some());
        }
    }

    #[test]
    fn higher_sequence_wins() {
        let mut table = PeerTable::new();
        table.merge(record("a", 1, &["10.0.0.1:51820"]));
        table.merge(record("a", 5, &["10.0.0.9:51820"]));
        assert_eq!(
            table.get("a").unwrap().endpoints[0],
            "10.0.0.9:51820"
        );
        table.merge(record("a", 3, &["10.0.0.2:51820"]));
        assert_eq!(
            table.get("a").unwrap().endpoints[0],
            "10.0.0.9:51820"
        );
    }

    #[test]
    fn framed_batch_roundtrip() {
        let mut table = PeerTable::new();
        table.merge(record("a", 1, &["10.0.0.1:51820"]));
        table.merge(record("b", 1, &["10.0.0.2:51820"]));
        let mut wire = Vec::new();
        for frame in table.export_frames() {
            wire.extend_from_slice(&frame);
        }
        let mut other = PeerTable::new();
        assert_eq!(other.import_frames(&wire), 2);
        assert!(other.get("a").is_some());
        assert!(other.get("b").is_some());
    }
}
