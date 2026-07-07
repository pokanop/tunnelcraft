//! R12 — relay-through-peer when direct hole punching fails (T05L5 / T05 petgraph lab).

use petgraph::algo::astar;
use petgraph::graph::{NodeIndex, UnGraph};

/// Overlay peer graph: nodes are peers, edge weights are live latency (ms).
/// Links that failed hole punching are simply absent — relay is shortest-path.
pub struct RelayGraph {
    inner: UnGraph<&'static str, u32>,
    index: std::collections::HashMap<&'static str, NodeIndex>,
}

impl RelayGraph {
    pub fn new() -> Self {
        Self {
            inner: UnGraph::new_undirected(),
            index: std::collections::HashMap::new(),
        }
    }

    pub fn add_peer(&mut self, name: &'static str) -> NodeIndex {
        if let Some(&idx) = self.index.get(name) {
            return idx;
        }
        let idx = self.inner.add_node(name);
        self.index.insert(name, idx);
        idx
    }

    pub fn link(&mut self, a: &'static str, b: &'static str, latency_ms: u32) {
        let ai = self.add_peer(a);
        let bi = self.add_peer(b);
        self.inner.add_edge(ai, bi, latency_ms);
    }

    /// Simulate a blocked direct path — remove the edge if present.
    pub fn block_direct(&mut self, a: &'static str, b: &'static str) {
        let Some(&ai) = self.index.get(a) else {
            return;
        };
        let Some(&bi) = self.index.get(b) else {
            return;
        };
        if let Some(edge) = self.inner.find_edge(ai, bi) {
            self.inner.remove_edge(edge);
        }
    }

    /// Lowest-latency path; two hops means relay via the middle peer.
    pub fn plan(&self, from: &'static str, to: &'static str) -> Option<RelayPlan> {
        let start = *self.index.get(from)?;
        let goal = *self.index.get(to)?;
        let result = astar(
            &self.inner,
            start,
            |n| n == goal,
            |e| *e.weight(),
            |_| 0,
        )?;
        let (latency, path) = result;
        let hops: Vec<&'static str> = path.iter().map(|&n| self.inner[n]).collect();
        Some(RelayPlan { latency, hops })
    }
}

impl Default for RelayGraph {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RelayPlan {
    pub latency: u32,
    pub hops: Vec<&'static str>,
}

impl RelayPlan {
    pub fn uses_relay(&self) -> bool {
        self.hops.len() > 2
    }

    pub fn next_hop(&self) -> Option<&'static str> {
        self.hops.get(1).copied()
    }

    /// Forward `payload` toward `dest` — at each hop the relay sends to the next peer.
    pub fn forward_hops(&self) -> &[&'static str] {
        &self.hops[1..]
    }
}

/// Apply relay forwarding: returns the ordered peers that must carry the packet.
pub fn relay_forward(plan: &RelayPlan) -> Vec<&'static str> {
    plan.forward_hops().to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocked_direct_uses_relay_peer() {
        let mut mesh = RelayGraph::new();
        mesh.link("A", "C", 30);
        mesh.link("C", "D", 40);
        mesh.link("A", "D", 200); // congested direct — still present initially
        mesh.block_direct("A", "D"); // hole punch failed

        let plan = mesh.plan("A", "D").expect("reachable via C");
        assert_eq!(plan.hops, vec!["A", "C", "D"]);
        assert!(plan.uses_relay());
        assert_eq!(plan.latency, 70);
        assert_eq!(relay_forward(&plan), vec!["C", "D"]);
    }

    #[test]
    fn direct_path_is_one_hop() {
        let mut mesh = RelayGraph::new();
        mesh.link("A", "B", 25);
        let plan = mesh.plan("A", "B").unwrap();
        assert_eq!(plan.hops, vec!["A", "B"]);
        assert!(!plan.uses_relay());
    }
}
