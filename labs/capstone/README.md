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

## R14 and real hardware

The `upnp` module ships a **mock gateway** so tests run in CI without a router. To exercise `igd-next` against a live IGD on your LAN:

```sh
cargo test --features live-upnp -- --ignored
```

(Requires the `igd-next` optional dependency and a UPnP-enabled router.)
