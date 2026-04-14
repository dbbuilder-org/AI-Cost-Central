"use client";

import { useState } from "react";
import { formatDistanceToNow } from "@/lib/utils";

interface Member {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  status: string;
  joinedAt: Date;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
}

const ROLE_COLORS: Record<string, string> = {
  owner: "text-yellow-400",
  admin: "text-blue-400",
  viewer: "text-gray-400",
};

export function MembersClient({
  initialMembers,
  initialInvitations,
}: {
  initialMembers: Member[];
  initialInvitations: Invitation[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);
    try {
      const res = await fetch("/api/org/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json() as { error?: string; invited?: boolean; id?: string };
      if (!res.ok) {
        setInviteError(data.error ?? "Failed to send invitation");
        return;
      }
      setInviteSuccess(true);
      setInviteEmail("");
      setInvitations((prev) => [
        ...prev,
        { id: data.id!, email: inviteEmail, role: inviteRole, status: "pending", expiresAt: new Date(Date.now() + 7 * 86400000) },
      ]);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    await fetch(`/api/org/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role } : m));
  };

  const handleDeactivate = async (memberId: string) => {
    if (!confirm("Deactivate this member?")) return;
    await fetch(`/api/org/members/${memberId}`, { method: "DELETE" });
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, status: "deactivated" } : m));
  };

  return (
    <div className="space-y-8">
      {/* Invite form */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4 text-sm">Invite a team member</h2>
        <form onSubmit={handleInvite} className="flex gap-3">
          <input
            type="email"
            required
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
          >
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
          >
            {inviting ? "Sending…" : "Invite"}
          </button>
        </form>
        {inviteError && <p className="text-red-400 text-xs mt-2">{inviteError}</p>}
        {inviteSuccess && <p className="text-green-400 text-xs mt-2">Invitation sent!</p>}
      </div>

      {/* Members list */}
      <div className="space-y-3">
        <h2 className="text-white font-semibold text-sm">{members.length} member{members.length !== 1 ? "s" : ""}</h2>
        {members.map((member) => (
          <div
            key={member.id}
            className={`flex items-center justify-between bg-gray-900 border rounded-xl px-4 py-3 ${
              member.status === "deactivated" ? "border-gray-900 opacity-50" : "border-gray-800"
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white text-sm font-medium">{member.fullName ?? member.email}</span>
                <span className={`text-xs font-medium capitalize ${ROLE_COLORS[member.role] ?? "text-gray-400"}`}>
                  {member.role}
                </span>
                {member.status === "deactivated" && (
                  <span className="text-xs text-gray-600">deactivated</span>
                )}
              </div>
              {member.fullName && (
                <p className="text-xs text-gray-500">{member.email}</p>
              )}
              <p className="text-xs text-gray-600 mt-0.5">Joined {formatDistanceToNow(member.joinedAt)}</p>
            </div>

            {member.status === "active" && member.role !== "owner" && (
              <div className="flex items-center gap-3">
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.id, e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={() => handleDeactivate(member.id)}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pending invitations */}
      {invitations.filter((i) => i.status === "pending").length > 0 && (
        <div className="space-y-3">
          <h2 className="text-gray-400 font-semibold text-sm">Pending invitations</h2>
          {invitations.filter((i) => i.status === "pending").map((inv) => (
            <div key={inv.id} className="flex items-center justify-between bg-gray-900 border border-dashed border-gray-800 rounded-xl px-4 py-3">
              <div>
                <span className="text-gray-300 text-sm">{inv.email}</span>
                <p className="text-xs text-gray-600 mt-0.5">
                  Invited as {inv.role} · expires {formatDistanceToNow(inv.expiresAt)}
                </p>
              </div>
              <span className="text-xs text-yellow-600 bg-yellow-900/20 px-2 py-0.5 rounded-full">Pending</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
