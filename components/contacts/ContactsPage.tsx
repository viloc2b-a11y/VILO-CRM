"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useCrmStore } from "@/lib/store";
import { useEffect, useMemo, useState } from "react";

import { OrganizationReportActions } from "@/components/contacts/OrganizationReportActions";
import Link from "next/link";

type Tab = "organizations" | "contacts";

export function ContactsPage() {
  const organizations = useCrmStore((s) => s.organizations);
  const contacts = useCrmStore((s) => s.contacts);
  const addOrganization = useCrmStore((s) => s.addOrganization);
  const addContact = useCrmStore((s) => s.addContact);
  const updateOrganization = useCrmStore((s) => s.updateOrganization);
  const updateContact = useCrmStore((s) => s.updateContact);
  const deleteOrganization = useCrmStore((s) => s.deleteOrganization);
  const deleteContact = useCrmStore((s) => s.deleteContact);
  const loadOrganizations = useCrmStore((s) => s.loadOrganizations);
  const loadContacts = useCrmStore((s) => s.loadContacts);

  useEffect(() => {
    void loadOrganizations();
    void loadContacts();
  }, [loadOrganizations, loadContacts]);

  const [tab, setTab] = useState<Tab>("organizations");
  const [quickOpen, setQuickOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgWebsite, setOrgWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [q, setQ] = useState("");

  const orgById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of organizations) m.set(o.id, o.name);
    return m;
  }, [organizations]);

  const filteredOrgs = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return organizations;
    return organizations.filter((o) => o.name.toLowerCase().includes(t));
  }, [organizations, q]);

  const filteredContacts = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(t) ||
        (c.email ?? "").toLowerCase().includes(t) ||
        (orgById.get(c.organizationId) ?? "").toLowerCase().includes(t)
    );
  }, [contacts, orgById, q]);

  function resetQuick() {
    setOrgName("");
    setOrgWebsite("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setContactRole("");
  }

  async function submitQuick(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    try {
      const org = await addOrganization({ name: orgName.trim(), website: orgWebsite.trim() || undefined });
      if (contactName.trim()) {
        await addContact({
          organizationId: org.id,
          name: contactName.trim(),
          email: contactEmail.trim() || undefined,
          phone: contactPhone.trim() || undefined,
          role: contactRole.trim() || undefined,
        });
      }
      setQuickOpen(false);
      resetQuick();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Vilo only</div>
          <h1 className="text-2xl font-semibold text-clinical-ink">Contacts</h1>
          <p className="mt-1 max-w-xl text-sm text-clinical-muted">
            Organizations and business contacts. Patient leads live exclusively in Vitalis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="w-56" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button onClick={() => setQuickOpen(true)}>Quick add</Button>
        </div>
      </header>

      <div className="mb-4 inline-flex rounded-lg border border-clinical-line bg-white p-0.5 text-sm shadow-sm">
        {(
          [
            { id: "organizations" as const, label: "Organizations" },
            { id: "contacts" as const, label: "Contacts" },
          ] as const
        ).map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={
              tab === x.id
                ? "rounded-md bg-vilo-100 px-3 py-1.5 font-medium text-vilo-900"
                : "rounded-md px-3 py-1.5 text-clinical-muted hover:text-clinical-ink"
            }
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === "organizations" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOrgs.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-clinical-ink">{o.name}</div>
                  <div className="truncate text-xs text-clinical-muted">{o.website || "—"}</div>
                </div>
                <Badge tone="vilo">
                  {contacts.filter((c) => c.organizationId === o.id).length} contacts
                </Badge>
              </div>
              {o.notes && <p className="mt-2 line-clamp-3 text-xs text-clinical-muted">{o.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/dashboard/organizations/${o.id}`}
                  className="inline-flex items-center justify-center rounded-lg bg-vilo-600 px-2 py-1 text-xs font-medium text-white hover:bg-vilo-700"
                >
                  Open workspace
                </Link>
                <Button
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  onClick={() => {
                    const name = window.prompt("Organization name", o.name);
                    if (name) {
                      void updateOrganization(o.id, { name }).catch((err) => {
                        console.error(err);
                        window.alert(err instanceof Error ? err.message : "Could not update organization");
                      });
                    }
                  }}
                >
                  Rename
                </Button>
                <Button
                  variant="danger"
                  className="px-2 py-1 text-xs"
                  onClick={() => {
                    if (window.confirm(`Delete ${o.name}? Contacts under this org will be removed.`)) {
                      void deleteOrganization(o.id).catch((err) => {
                        console.error(err);
                        window.alert(err instanceof Error ? err.message : "Could not delete organization");
                      });
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
              <OrganizationReportActions
                organizationId={o.id}
                organizationName={o.name}
                defaultRecipientEmail={
                  contacts.find((c) => c.organizationId === o.id && c.email?.trim())?.email ?? null
                }
              />
            </Card>
          ))}
          {filteredOrgs.length === 0 && (
            <div className="col-span-full text-sm text-clinical-muted">No organizations match.</div>
          )}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-clinical-line bg-vilo-50/60 text-xs uppercase text-clinical-muted">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Organization</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((c) => (
                <tr key={c.id} className="border-b border-clinical-line last:border-0">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-clinical-muted">{orgById.get(c.organizationId) ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{c.role || "—"}</td>
                  <td className="px-3 py-2 text-xs">{c.email || "—"}</td>
                  <td className="px-3 py-2 text-xs">{c.phone || "—"}</td>
                  <td className="space-x-2 px-3 py-2 text-right">
                    <Link
                      href={`/vilo/contacts/${c.id}`}
                      className="mr-2 inline-block text-xs font-medium text-vilo-700 underline-offset-2 hover:underline"
                    >
                      Timeline
                    </Link>
                    <Button
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={() => {
                        const name = window.prompt("Contact name", c.name);
                        if (name) {
                          void updateContact(c.id, { name }).catch((err) => {
                            console.error(err);
                            window.alert(err instanceof Error ? err.message : "Could not update contact");
                          });
                        }
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      className="px-2 py-1 text-xs"
                      onClick={() => {
                        if (window.confirm(`Delete ${c.name}?`)) {
                          void deleteContact(c.id).catch((err) => {
                            console.error(err);
                            window.alert(err instanceof Error ? err.message : "Could not delete contact");
                          });
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredContacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-clinical-muted">
                    No contacts match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={quickOpen} onClose={() => setQuickOpen(false)} title="Quick add — organization + contact">
        <form onSubmit={submitQuick} className="space-y-3">
          <div className="text-xs text-clinical-muted">Organization (required)</div>
          <Input required placeholder="Company name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          <Input placeholder="Website (optional)" value={orgWebsite} onChange={(e) => setOrgWebsite(e.target.value)} />
          <div className="border-t border-clinical-line pt-3 text-xs text-clinical-muted">
            Primary contact (optional)
          </div>
          <Input placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <Input placeholder="Role" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
          <Input placeholder="Email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          <Input placeholder="Phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setQuickOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
