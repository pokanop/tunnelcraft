//! R2 — length-prefixed framing reused by every mesh control message.

use std::io;

/// Maximum frame payload size (guards against hostile length fields).
pub const MAX_FRAME_SIZE: u32 = 64 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub enum FrameError {
    Empty,
    LengthTooLarge { len: u32 },
    Truncated { expected: u32, got: usize },
}

impl std::fmt::Display for FrameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => write!(f, "empty frame buffer"),
            Self::LengthTooLarge { len } => write!(f, "frame length {len} exceeds MAX_FRAME_SIZE"),
            Self::Truncated { expected, got } => {
                write!(f, "frame truncated: need {expected} payload bytes, have {got}")
            }
        }
    }
}

impl std::error::Error for FrameError {}

/// Encode `payload` as a 4-byte big-endian length prefix + body (R2 convention).
pub fn encode_frame(payload: &[u8]) -> Result<Vec<u8>, FrameError> {
    let len = payload.len();
    if len == 0 {
        return Err(FrameError::Empty);
    }
    let len_u32 = u32::try_from(len).map_err(|_| FrameError::LengthTooLarge { len: len as u32 })?;
    if len_u32 > MAX_FRAME_SIZE {
        return Err(FrameError::LengthTooLarge { len: len_u32 });
    }
    let mut out = Vec::with_capacity(4 + len);
    out.extend_from_slice(&len_u32.to_be_bytes());
    out.extend_from_slice(payload);
    Ok(out)
}

/// Decode one frame from `buf`. Returns `(payload, consumed_bytes)`.
pub fn decode_frame(buf: &[u8]) -> Result<(&[u8], usize), FrameError> {
    if buf.len() < 4 {
        return Err(FrameError::Truncated {
            expected: 4,
            got: buf.len(),
        });
    }
    let len = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
    if len == 0 {
        return Err(FrameError::Empty);
    }
    if len > MAX_FRAME_SIZE {
        return Err(FrameError::LengthTooLarge { len });
    }
    let total = 4 + len as usize;
    if buf.len() < total {
        return Err(FrameError::Truncated {
            expected: len,
            got: buf.len().saturating_sub(4),
        });
    }
    Ok((&buf[4..total], total))
}

/// Read exactly one frame from a blocking TCP-style byte source.
pub fn read_frame<R: io::Read>(mut r: R) -> io::Result<Vec<u8>> {
    let mut hdr = [0u8; 4];
    io::Read::read_exact(&mut r, &mut hdr)?;
    let len = u32::from_be_bytes(hdr);
    if len == 0 || len > MAX_FRAME_SIZE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            FrameError::LengthTooLarge { len },
        ));
    }
    let mut payload = vec![0u8; len as usize];
    io::Read::read_exact(&mut r, &mut payload)?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let body = b"hello mesh";
        let wire = encode_frame(body).unwrap();
        let (decoded, n) = decode_frame(&wire).unwrap();
        assert_eq!(decoded, body);
        assert_eq!(n, wire.len());
    }

    #[test]
    fn rejects_oversized_length() {
        let mut wire = vec![0u8; 4];
        wire.extend_from_slice(&[0u8; 8]);
        wire[0..4].copy_from_slice(&(MAX_FRAME_SIZE + 1).to_be_bytes());
        assert!(matches!(
            decode_frame(&wire),
            Err(FrameError::LengthTooLarge { .. })
        ));
    }
}
