//! Minimal protobuf wire encoding for peer-exchange records (R11 / T05 lab).
//!
//! Hand-rolled to avoid code-gen in CI; matches the field layout learners design in
//! the T05 "Design the peer-exchange protocol" sequence exercise.

use std::io;

/// One signed gossip record: origin identity, monotonic seq, endpoints, routes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PeerRecord {
    pub origin_key: String,
    pub seq: u64,
    pub endpoints: Vec<String>,
    pub routes: Vec<String>,
}

impl PeerRecord {
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::new();
        write_string_field(&mut out, 1, &self.origin_key);
        write_varint_field(&mut out, 2, self.seq);
        for ep in &self.endpoints {
            write_string_field(&mut out, 3, ep);
        }
        for route in &self.routes {
            write_string_field(&mut out, 4, route);
        }
        out
    }

    pub fn decode(mut buf: &[u8]) -> io::Result<Self> {
        let mut origin_key = String::new();
        let mut seq = 0u64;
        let mut endpoints = Vec::new();
        let mut routes = Vec::new();

        while !buf.is_empty() {
            let (tag, rest) = read_varint(buf)?;
            buf = rest;
            let field = tag >> 3;
            let wire = tag & 0x7;
            match (field, wire) {
                (1, 2) => {
                    let (s, rest) = read_len_delimited(buf)?;
                    origin_key = String::from_utf8(s.to_vec())
                        .map_err(|_| invalid("origin_key utf8"))?;
                    buf = rest;
                }
                (2, 0) => {
                    let (v, rest) = read_varint(buf)?;
                    seq = v;
                    buf = rest;
                }
                (3, 2) => {
                    let (s, rest) = read_len_delimited(buf)?;
                    endpoints.push(
                        String::from_utf8(s.to_vec()).map_err(|_| invalid("endpoint utf8"))?,
                    );
                    buf = rest;
                }
                (4, 2) => {
                    let (s, rest) = read_len_delimited(buf)?;
                    routes.push(
                        String::from_utf8(s.to_vec()).map_err(|_| invalid("route utf8"))?,
                    );
                    buf = rest;
                }
                _ => return Err(invalid("unknown field")),
            }
        }

        if origin_key.is_empty() {
            return Err(invalid("missing origin_key"));
        }
        Ok(Self {
            origin_key,
            seq,
            endpoints,
            routes,
        })
    }
}

fn invalid(msg: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, msg)
}

fn write_string_field(out: &mut Vec<u8>, field: u32, s: &str) {
    write_tag(out, field, 2);
    write_varint(out, s.len() as u64);
    out.extend_from_slice(s.as_bytes());
}

fn write_varint_field(out: &mut Vec<u8>, field: u32, v: u64) {
    write_tag(out, field, 0);
    write_varint(out, v);
}

fn write_tag(out: &mut Vec<u8>, field: u32, wire: u32) {
    write_varint(out, ((field << 3) | wire) as u64);
}

fn write_varint(out: &mut Vec<u8>, mut v: u64) {
    while v >= 0x80 {
        out.push((v as u8) | 0x80);
        v >>= 7;
    }
    out.push(v as u8);
}

fn read_varint(buf: &[u8]) -> io::Result<(u64, &[u8])> {
    let mut val = 0u64;
    let mut shift = 0u32;
    for (i, &b) in buf.iter().enumerate() {
        val |= ((b & 0x7f) as u64) << shift;
        if b & 0x80 == 0 {
            return Ok((val, &buf[i + 1..]));
        }
        shift += 7;
        if shift > 63 {
            return Err(invalid("varint overflow"));
        }
    }
    Err(invalid("truncated varint"))
}

fn read_len_delimited(buf: &[u8]) -> io::Result<(&[u8], &[u8])> {
    let (len, rest) = read_varint(buf)?;
    let len = len as usize;
    if rest.len() < len {
        return Err(invalid("truncated string"));
    }
    Ok((&rest[..len], &rest[len..]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let rec = PeerRecord {
            origin_key: "node-a".into(),
            seq: 42,
            endpoints: vec!["10.0.0.1:51820".into()],
            routes: vec!["192.168.1.0/24".into()],
        };
        let wire = rec.encode();
        assert_eq!(PeerRecord::decode(&wire).unwrap(), rec);
    }
}
