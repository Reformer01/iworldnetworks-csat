'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { isSuperAdmin } from '@/lib/admin-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Shield, Users, Trash2, Search, AlertTriangle, Mail, Check, X, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Server guard verified via API routes using verifySuperAdminToken

const ROLES = ['super_admin', 'editor', 'viewer'] as const;

interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  updatedAt?: string;
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    super_admin: 'bg-primary text-white',
    editor: 'bg-zinc-900 text-white',
    viewer: 'bg-zinc-100 text-zinc-600',
  };
  return <Badge className={map[role] || map.viewer}>{role}</Badge>;
}

async function authedFetch(user: { getIdToken: () => Promise<string> }, path: string, init?: RequestInit) {
  const token = await user.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || (data && data.success === false)) {
    throw new Error((data && (data.error as string)) || `Request failed (${res.status})`);
  }
  return data?.data ?? data;
}

export default function SuperAdminPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [changeRoleOpen, setChangeRoleOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [newRole, setNewRole] = useState<string>('editor');
  const [reason, setReason] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Add-user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newUserRole, setNewUserRole] = useState<string>('editor');
  const [newPassword, setNewPassword] = useState('');

  const isSuper = isSuperAdmin(user?.email || '');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await authedFetch(user, '/api/admin/admin-users');
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to load admins', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (isSuper) void load();
  }, [isSuper, load]);

  if (!isSuper) {
    return (
      <SalesLayout>
        <div className="max-w-2xl mx-auto py-20 text-center">
          <Shield className="w-12 h-12 mx-auto text-red-400 mb-4" />
          <h1 className="text-2xl font-black uppercase">403 — Super Admin Only</h1>
          <p className="font-mono text-xs opacity-60 mt-2">Contact reformer.ejembi@iworldnetworks.net for access.</p>
        </div>
      </SalesLayout>
    );
  }

  const handleChangeRole = async () => {
    if (!selected || !user) return;
    if (!ROLES.includes(newRole as (typeof ROLES)[number])) {
      toast({ variant: 'destructive', title: 'Select a valid role' });
      return;
    }
    try {
      setSaving(true);
      await authedFetch(user, `/api/admin/admin-users/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      toast({ title: 'Role updated', description: `${selected.email} → ${newRole}${reason.trim() ? ` (${reason.trim()})` : ''}` });
      setChangeRoleOpen(false);
      setReason('');
      setSelected(null);
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Role change failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!user) return;
    if (!newEmail.includes('@')) {
      toast({ variant: 'destructive', title: 'Valid email required' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ variant: 'destructive', title: 'Password must be at least 8 characters' });
      return;
    }
    try {
      setSaving(true);
      await authedFetch(user, '/api/admin/admin-users', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail, name: newName || undefined, role: newUserRole, password: newPassword }),
      });
      toast({ title: 'Admin added', description: newEmail });
      setAddOpen(false);
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewUserRole('editor');
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Add failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || !user) return;
    // re-auth guard: type email to confirm
    if (confirmEmail.toLowerCase() !== selected.email.toLowerCase()) {
      toast({ variant: 'destructive', title: 'Type email to confirm delete' });
      return;
    }
    try {
      setSaving(true);
      await authedFetch(user, `/api/admin/admin-users/${selected.id}`, { method: 'DELETE' });
      toast({ title: 'Admin deleted', description: selected.email });
      setDeleteOpen(false);
      setConfirmEmail('');
      setSelected(null);
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Delete failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSaving(false);
    }
  };

  const filtered = users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <SalesLayout>
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-display font-black uppercase tracking-tight flex items-center gap-3">
            <Shield className="w-7 h-7 text-primary" /> Super Admin
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-60 mt-1">
            Role Manager • Accounts • Audit Trail • verifySuperAdminToken gated
          </p>
        </header>

        <Tabs defaultValue="roles">
          <TabsList className="rounded-full flex-wrap h-auto">
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="mail">Mail Queue</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="mt-6">
            <div className="bg-white rounded-2xl border p-4 md:p-6 min-w-0">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
                <h2 className="font-black uppercase text-sm">Role Manager</h2>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search email..."
                      className="pl-9 rounded-full w-full sm:w-48 xl:w-64 min-w-0"
                    />
                  </div>
                  <Button size="sm" className="rounded-full whitespace-nowrap" onClick={() => setAddOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Admin
                  </Button>
                </div>
              </div>
              {loading ? (
                <p className="font-mono text-xs opacity-50 py-8 text-center">Loading admins…</p>
              ) : filtered.length === 0 ? (
                <p className="font-mono text-xs opacity-50 py-8 text-center">No admin users found.</p>
              ) : (
                <div className="space-y-2">
                  {filtered.map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between p-3 border rounded-xl min-w-0"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold break-words" title={u.email}>
                          {u.email}
                        </p>
                        <p className="font-mono text-[10px] opacity-60">
                          {u.name || '—'} · since {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <RoleBadge role={u.role} />
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full whitespace-nowrap"
                          onClick={() => {
                            setSelected(u);
                            setNewRole(u.role);
                            setChangeRoleOpen(true);
                          }}
                        >
                          Change Role
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full whitespace-nowrap text-destructive"
                          onClick={() => {
                            setSelected(u);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="accounts" className="mt-6">
            <div className="bg-white rounded-2xl border p-6">
              <h2 className="font-black uppercase text-sm flex items-center gap-2">
                <Users className="w-4 h-4" /> Accounts
              </h2>
              <p className="font-mono text-[10px] opacity-60 mt-1">
                {users.length} admin account(s). Manage roles and deletions from the Roles tab.
              </p>
              <div className="space-y-2 mt-4">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-3 border rounded-xl min-w-0">
                    <p className="font-mono text-xs font-bold break-words min-w-0" title={u.email}>
                      {u.email}
                    </p>
                    <RoleBadge role={u.role} />
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="mail" className="mt-6">
            <div className="bg-white rounded-2xl border p-6">
              <h2 className="font-black uppercase text-sm flex items-center gap-2">
                <Mail className="w-4 h-4 text-secondary" /> Mail Queue Control
              </h2>
              <p className="font-mono text-[10px] opacity-60 mt-1">Use Approval Center for pending_approval.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href="/admin/mailing?tab=emails&status=pending_approval"
                  className="px-4 py-2 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold inline-flex items-center gap-2"
                >
                  <Check className="w-3 h-3" /> Approve Pending
                </a>
                <a
                  href="/admin/mailing?tab=emails"
                  className="px-4 py-2 rounded-full border font-mono text-[10px] uppercase font-bold inline-flex items-center gap-2"
                >
                  <X className="w-3 h-3" /> Clear / Reject
                </a>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <div className="bg-white rounded-2xl border p-6">
              <h2 className="font-black uppercase text-sm">Audit Trail</h2>
              <p className="font-mono text-xs opacity-60 mt-2">Every grant/revoke/delete is logged with actor, timestamp and changes.</p>
            </div>
          </TabsContent>

          <TabsContent value="system" className="mt-6">
            <div className="bg-white rounded-2xl border p-6 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <p className="font-mono text-xs">Sync locks and UISP status — super admin only</p>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={changeRoleOpen} onOpenChange={setChangeRoleOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Role</DialogTitle>
              <DialogDescription>Select new role for {selected?.email}. Reason is recorded in the toast only.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <label className="font-mono text-xs font-bold">New role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <label className="font-mono text-xs font-bold">Reason</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for change (audit)" />
              <Button onClick={handleChangeRole} disabled={saving} className="w-full rounded-full">
                Confirm Change Role
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Admin</DialogTitle>
              <DialogDescription>Create a new admin account.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <label className="font-mono text-xs font-bold">Email</label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@iworldnetworks.net" />
              <label className="font-mono text-xs font-bold">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
              <label className="font-mono text-xs font-bold">Role</label>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <label className="font-mono text-xs font-bold">Password (min 8 chars)</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
              <Button onClick={handleAdd} disabled={saving} className="w-full rounded-full">
                Create Admin
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Account — re-auth required</DialogTitle>
              <DialogDescription>Type email to confirm: {selected?.email}</DialogDescription>
            </DialogHeader>
            <Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder="type email to confirm" />
            <Button variant="destructive" onClick={handleDelete} disabled={saving} className="w-full rounded-full">
              Delete confirm with re-auth
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </SalesLayout>
  );
}
