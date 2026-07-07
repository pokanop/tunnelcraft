//! S03 capstone reference labs — mesh rungs R11–R14.
//!
//! Learners implement these artifacts in their own client repo; this crate is the
//! tested reference that follows the ladder conventions from module S03.

pub mod frame;
pub mod peer;
pub mod proto;
pub mod relay;
pub mod routes;
pub mod upnp;

pub use frame::{decode_frame, encode_frame, FrameError, MAX_FRAME_SIZE};
pub use peer::{gossip_round, PeerTable, NodeId};
pub use proto::PeerRecord;
pub use relay::{RelayGraph, RelayPlan};
pub use routes::RouteTable;
pub use upnp::{MockGateway, PortMapping, UpnpMapper};
