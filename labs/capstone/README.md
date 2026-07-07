# S03 capstone labs — rungs R11–R14

Reference implementations for the mesh-shaped capstone ladder in module **S03**. Each rung builds on the previous one and reuses the **R2 framed protocol** (length-prefixed messages with a max-size guard).

| Rung | Module   | What it teaches                                                                                                          |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| R11  | `peer`   | Peer-info exchange between 3+ nodes — protobuf records over framed TCP, table merge (see T05 peer-exchange sequence lab) |
| R12  | `relay`  | Relay-through-peer when direct hole punching fails — `petgraph` path selection + forwarding                              |
| R13  | `routes` | Subnet proxy — advertise a LAN `/24`, propagate to all peers                                                             |
| R14  | `upnp`   | UPnP IGD port mapping (`igd-next` pattern) as a traversal aid alongside relay                                            |

## Run tests

```sh
cd labs/capstone
cargo test
```

CI runs the same command on every PR. A full system toolchain (`build-essential` on Linux) is required to link test binaries.

## R14 and live routers

The `upnp` module ships a **mock gateway** so tests run in CI without a router. Wiring real **`igd-next`** calls against a UPnP-enabled IGD is the learner's R14 exercise — use the S03 igd-next CODE LAB sketch and `production_igd_next_sketch()` in `upnp.rs` as the starting point. This reference crate intentionally ships only the mock so CI stays hermetic.
