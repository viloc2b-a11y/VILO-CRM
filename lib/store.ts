"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ViloStage, VitalisStage } from "./constants";
import { seedContacts, seedOrganizations, seedPatientLeads, seedTasks, seedViloOpportunities } from "./seed";
import type { Contact, Organization, PatientLead, TaskItem, ViloOpportunity } from "./types";

function id(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface CrmState {
  organizations: Organization[];
  contacts: Contact[];
  viloOpportunities: ViloOpportunity[];
  patientLeads: PatientLead[];
  tasks: TaskItem[];
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;

  addOrganization: (o: Omit<Organization, "id" | "createdAt">) => Organization;
  updateOrganization: (id: string, patch: Partial<Organization>) => void;
  deleteOrganization: (id: string) => void;

  addContact: (c: Omit<Contact, "id" | "createdAt">) => Contact;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  deleteContact: (id: string) => void;

  addViloOpportunity: (o: Omit<ViloOpportunity, "id" | "createdAt" | "updatedAt">) => ViloOpportunity;
  updateViloOpportunity: (id: string, patch: Partial<ViloOpportunity>) => void;
  deleteViloOpportunity: (id: string) => void;
  setViloStage: (id: string, status: ViloStage) => void;

  addPatientLead: (l: Omit<PatientLead, "id" | "createdAt" | "updatedAt">) => PatientLead;
  updatePatientLead: (id: string, patch: Partial<PatientLead>) => void;
  deletePatientLead: (id: string) => void;
  setVitalisStage: (id: string, currentStage: VitalisStage) => void;

  addTask: (t: Omit<TaskItem, "id" | "createdAt">) => TaskItem;
  updateTask: (id: string, patch: Partial<TaskItem>) => void;
  toggleTaskCompleted: (id: string) => void;
  deleteTask: (id: string) => void;
}

const now = () => new Date().toISOString();

export const useCrmStore = create<CrmState>()(
  persist(
    (set, get) => ({
      organizations: seedOrganizations(),
      contacts: seedContacts(),
      viloOpportunities: seedViloOpportunities(),
      patientLeads: seedPatientLeads(),
      tasks: seedTasks(),
      sidebarCollapsed: false,

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      addOrganization: (o) => {
        const row: Organization = { ...o, id: id(), createdAt: now() };
        set((s) => ({ organizations: [...s.organizations, row] }));
        return row;
      },
      updateOrganization: (idStr, patch) =>
        set((s) => ({
          organizations: s.organizations.map((x) => (x.id === idStr ? { ...x, ...patch } : x)),
        })),
      deleteOrganization: (idStr) =>
        set((s) => ({
          organizations: s.organizations.filter((x) => x.id !== idStr),
          contacts: s.contacts.filter((c) => c.organizationId !== idStr),
        })),

      addContact: (c) => {
        const row: Contact = { ...c, id: id(), createdAt: now() };
        set((s) => ({ contacts: [...s.contacts, row] }));
        return row;
      },
      updateContact: (idStr, patch) =>
        set((s) => ({
          contacts: s.contacts.map((x) => (x.id === idStr ? { ...x, ...patch } : x)),
        })),
      deleteContact: (idStr) =>
        set((s) => ({
          contacts: s.contacts.filter((x) => x.id !== idStr),
          viloOpportunities: s.viloOpportunities.map((o) =>
            o.primaryContactId === idStr ? { ...o, primaryContactId: undefined } : o
          ),
        })),

      addViloOpportunity: (o) => {
        const t = now();
        const row: ViloOpportunity = { ...o, id: id(), createdAt: t, updatedAt: t };
        set((s) => ({ viloOpportunities: [...s.viloOpportunities, row] }));
        return row;
      },
      updateViloOpportunity: (idStr, patch) =>
        set((s) => ({
          viloOpportunities: s.viloOpportunities.map((x) =>
            x.id === idStr ? { ...x, ...patch, updatedAt: now() } : x
          ),
        })),
      deleteViloOpportunity: (idStr) =>
        set((s) => ({
          viloOpportunities: s.viloOpportunities.filter((x) => x.id !== idStr),
          tasks: s.tasks.filter((t) => !(t.entityType === "vilo_opportunity" && t.entityId === idStr)),
        })),
      setViloStage: (idStr, status) => {
        const prev = get().viloOpportunities.find((x) => x.id === idStr);
        if (!prev) return;
        const t = now();
        const patch: Partial<ViloOpportunity> = { status };
        if (status === "Feasibility Sent" && !prev.feasibilitySentAt) patch.feasibilitySentAt = t;
        if (status === "Negotiation" && prev.status !== "Negotiation" && !prev.negotiationEnteredAt) {
          patch.negotiationEnteredAt = t;
        }
        if (status === "Activated / Closed Won" && !prev.closedWonAt) patch.closedWonAt = t;
        if (status === "Closed Lost" && !prev.closedLostAt) patch.closedLostAt = t;
        get().updateViloOpportunity(idStr, patch);
      },

      addPatientLead: (l) => {
        const t = now();
        const row: PatientLead = { ...l, id: id(), createdAt: t, updatedAt: t };
        set((s) => ({ patientLeads: [...s.patientLeads, row] }));
        return row;
      },
      updatePatientLead: (idStr, patch) =>
        set((s) => ({
          patientLeads: s.patientLeads.map((x) =>
            x.id === idStr ? { ...x, ...patch, updatedAt: now() } : x
          ),
        })),
      deletePatientLead: (idStr) =>
        set((s) => ({
          patientLeads: s.patientLeads.filter((x) => x.id !== idStr),
          tasks: s.tasks.filter((t) => !(t.entityType === "patient_lead" && t.entityId === idStr)),
        })),
      setVitalisStage: (idStr, currentStage) => get().updatePatientLead(idStr, { currentStage }),

      addTask: (t) => {
        const row: TaskItem = { ...t, id: id(), createdAt: now() };
        set((s) => ({ tasks: [...s.tasks, row] }));
        return row;
      },
      updateTask: (idStr, patch) =>
        set((s) => ({
          tasks: s.tasks.map((x) => (x.id === idStr ? { ...x, ...patch } : x)),
        })),
      toggleTaskCompleted: (idStr) =>
        set((s) => ({
          tasks: s.tasks.map((x) => (x.id === idStr ? { ...x, completed: !x.completed } : x)),
        })),
      deleteTask: (idStr) =>
        set((s) => ({
          tasks: s.tasks.filter((x) => x.id !== idStr),
        })),
    }),
    {
      name: "vilo-crm-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        organizations: s.organizations,
        contacts: s.contacts,
        viloOpportunities: s.viloOpportunities,
        patientLeads: s.patientLeads,
        tasks: s.tasks,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    }
  )
);
