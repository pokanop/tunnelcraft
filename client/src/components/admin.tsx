import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AdminUser } from "../lib/api";
import type { PublicUser } from "../lib/api";

/* Admin panel: list/search users, promote/demote admin role, delete a user.
   The server enforces every action — this view only renders affordances for
   admins and surfaces server errors (403 on a role flip, 409 on last-admin
   lockout). A non-admin who deep-links to /admin is shown the 403 state by the
   route wrapper and rejected by the API on every call regardless. */
interface AdminViewProps {
  me: PublicUser;
  onBack: () => void;
}

export function AdminView({ me, onBack }: AdminViewProps) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (query: string) => {
    setErr("");
    try {
      const r = await api.adminListUsers(query || undefined, 100, 0);
      setUsers(r.users);
      setTotal(r.total);
    } catch (e) {
      setUsers([]);
      setErr(e instanceof Error && e.message ? e.message : "Failed to load users");
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  const onSearch = () => load(q.trim());

  const setRole = async (u: AdminUser, role: AdminUser["role"]) => {
    if (u.role === role) return;
    setErr("");
    setBusyId(u.id);
    try {
      const r = await api.adminUpdateUser(u.id, { role });
      setUsers((cur) => (cur ? cur.map((x) => (x.id === u.id ? r.user : x)) : cur));
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (u: AdminUser) => {
    setErr("");
    setBusyId(u.id);
    try {
      await api.adminDeleteUser(u.id);
      setUsers((cur) => (cur ? cur.filter((x) => x.id !== u.id) : cur));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="wrap">
      <button className="back" onClick={onBack}>
        ← BACK TO COURSE
      </button>
      <div className="authcard admincard">
        <div className="eyebrow">ADMIN // USER MANAGEMENT</div>
        <h2 className="authttl">Users</h2>
        <p className="authsub">
          {total} account{total === 1 ? "" : "s"} on record. Role changes and deletions are
          server-audited.
        </p>

        <div className="admin-search">
          <input
            type="search"
            value={q}
            placeholder="search email or display name"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
          />
          <button className="btn ghost" onClick={onSearch}>
            SEARCH
          </button>
          {q && (
            <button
              className="btn ghost"
              onClick={() => {
                setQ("");
                load("");
              }}
            >
              CLEAR
            </button>
          )}
        </div>

        {err && (
          <div className="verdict badv" role="alert">
            ✗ {err}
          </div>
        )}

        {users === null ? (
          <p className="authsub">Loading…</p>
        ) : users.length === 0 ? (
          <p className="authsub">No users match.</p>
        ) : (
          <ul className="adminlist">
            {users.map((u) => {
              const isAdmin = u.role === "admin";
              const isSelf = u.id === me.id;
              return (
                <li className="adminrow" key={u.id}>
                  <div className="adminrow-info">
                    <div className="adminrow-name">
                      {u.displayName || u.email}
                      {isSelf && <span className="adminrow-self">YOU</span>}
                      <span className={isAdmin ? "vbadge ok" : "vbadge"}>
                        {isAdmin ? "ADMIN" : "USER"}
                      </span>
                      {!u.emailVerified && <span className="vbadge">UNVERIFIED</span>}
                    </div>
                    <div className="adminrow-meta">
                      {u.email} · joined {u.createdAt}
                    </div>
                  </div>
                  <div className="adminrow-actions">
                    <button
                      className="btn ghost"
                      disabled={busyId === u.id || isSelf}
                      title={isSelf ? "Ask another admin to change your role" : undefined}
                      onClick={() => setRole(u, isAdmin ? "user" : "admin")}
                    >
                      {isAdmin ? "DEMOTE" : "PROMOTE"}
                    </button>
                    <button
                      className="btn ghost dangerbtn"
                      disabled={busyId === u.id || isSelf}
                      title={isSelf ? "Use account settings to delete your own account" : undefined}
                      onClick={() => {
                        if (window.confirm(`Permanently delete ${u.email}? This cannot be undone.`))
                          deleteUser(u);
                      }}
                    >
                      DELETE
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="admin-foot">
          The server is the real gate: a 403 means you are no longer an admin, and a 409 means the
          change would remove the last admin.
        </p>
      </div>
    </div>
  );
}
