"use client";

import * as contactDb from "@/lib/db/contacts";
import * as orgDb from "@/lib/db/organizations";
import * as taskDb from "@/lib/db/tasks";
import * as vitalisDb from "@/lib/db/vitalis";
import * as viloDb from "@/lib/db/vilo";
import {
  contactRowToApp,
  contactToDbInsert,
  organizationRowToApp,
  organizationToDbInsert,
  organizationToDbUpdate,
  patientRowToApp,
  patientToDbInsert,
  patientToDbUpdate,
  taskRowToApp,
  taskToDbInsert,
  viloRowToApp,
  viloToDbInsert,
  viloToDbUpdate,
} from "@/lib/supabase/mappers";
import type {
  InsertOrganization,
  InsertPatientLead,
  InsertTask,
  InsertViloOpportunity,
  PatientLeadRow,
  TaskRow,
  UpdatePatientLead,
  UpdateViloOpportunity,
  ViloOpportunityRow,
} from "@/lib/supabase/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ViloStage, VitalisStage } from "./constants";
import type { Contact, Organization, PatientLead, TaskItem, ViloOpportunity } from "./types";

const now = () => new Date().toISOString();

const VILO_STAGE_LOG_KEYS = new Set<string>([
  "status",
  "feasibilitySentAt",
  "negotiationEnteredAt",
  "closedWonAt",
  "closedLostAt",
]);

async function logActivity(params: {
  action: string;
  entity_type: string;
  entity_id?: string;
  entity_label?: string;
  metadata?: Record<string, unknown>;
}) {
  void fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
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

  loadOrganizations: () => Promise<void>;
  loadContacts: () => Promise<void>;
  loadViloOpps: () => Promise<void>;
  loadVitalisLeads: () => Promise<void>;
  loadTasks: () => Promise<void>;

  addOrganization: (o: Omit<Organization, "id" | "createdAt">) => Promise<Organization>;
  updateOrganization: (id: string, patch: Partial<Organization>) => Promise<void>;
  deleteOrganization: (id: string) => Promise<void>;

  addContact: (c: Omit<Contact, "id" | "createdAt">) => Promise<Contact>;
  updateContact: (id: string, patch: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;

  addViloOpportunity: (o: Omit<ViloOpportunity, "id" | "createdAt" | "updatedAt">) => Promise<ViloOpportunity>;
  updateViloOpportunity: (id: string, patch: Partial<ViloOpportunity>) => Promise<void>;
  deleteViloOpportunity: (id: string) => Promise<void>;
  setViloStage: (id: string, status: ViloStage) => Promise<void>;

  addPatientLead: (l: Omit<PatientLead, "id" | "createdAt" | "updatedAt">) => Promise<PatientLead>;
  updatePatientLead: (id: string, patch: Partial<PatientLead>) => Promise<void>;
  deletePatientLead: (id: string) => Promise<void>;
  setVitalisStage: (id: string, currentStage: VitalisStage) => Promise<void>;

  addTask: (t: Omit<TaskItem, "id" | "createdAt">) => Promise<TaskItem>;
  updateTask: (id: string, patch: Partial<TaskItem>) => void;
  toggleTaskCompleted: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

export const useCrmStore = create<CrmState>()(
  persist(
    (set, get) => ({
      organizations: [],
      contacts: [],
      viloOpportunities: [],
      patientLeads: [],
      tasks: [],
      sidebarCollapsed: false,

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      loadOrganizations: async () => {
        const rows = await orgDb.getOrganizations();
        set({ organizations: rows.map((r) => organizationRowToApp(r)) });
      },

      loadContacts: async () => {
        const rows = await contactDb.getContacts();
        set({ contacts: rows.map((r) => contactRowToApp(r)) });
      },

      loadViloOpps: async () => {
        const rows = await viloDb.getViloOpportunities();
        set({ viloOpportunities: rows.map((r) => viloRowToApp(r as ViloOpportunityRow)) });
      },

      loadVitalisLeads: async () => {
        const rows = await vitalisDb.getPatientLeads();
        set({ patientLeads: rows.map((r) => patientRowToApp(r as PatientLeadRow)) });
      },

      loadTasks: async () => {
        const rows = await taskDb.getTasks();
        set({ tasks: rows.map((r) => taskRowToApp(r as TaskRow)) });
      },

      addOrganization: async (o) => {
        const insert = organizationToDbInsert(o) as InsertOrganization;
        const row = await orgDb.createOrganization(insert);
        const app = organizationRowToApp(row);
        set((s) => ({ organizations: [...s.organizations, app] }));
        void logActivity({
          action: "organization_created",
          entity_type: "organization",
          entity_id: app.id,
          entity_label: app.name,
        });
        return app;
      },

      updateOrganization: async (idStr, patch) => {
        const row = await orgDb.updateOrganization({
          id: idStr,
          ...(organizationToDbUpdate(patch) as Partial<InsertOrganization>),
        });
        const app = organizationRowToApp(row);
        set((s) => ({ organizations: s.organizations.map((x) => (x.id === idStr ? app : x)) }));
      },

      deleteOrganization: async (idStr) => {
        await orgDb.archiveOrganization(idStr);
        set((s) => ({
          organizations: s.organizations.filter((x) => x.id !== idStr),
          contacts: s.contacts.filter((c) => c.organizationId !== idStr),
        }));
      },

      addContact: async (c) => {
        const insert = contactToDbInsert(c);
        const row = await contactDb.createContact(insert);
        const app = contactRowToApp(row);
        set((s) => ({ contacts: [...s.contacts, app] }));
        void logActivity({
          action: "contact_created",
          entity_type: "contact",
          entity_id: app.id,
          entity_label: app.name,
        });
        return app;
      },

      updateContact: async (idStr, patch) => {
        const row = await contactDb.updateContact(idStr, patch);
        const app = contactRowToApp(row);
        set((s) => ({ contacts: s.contacts.map((x) => (x.id === idStr ? app : x)) }));
        void logActivity({
          action: "contact_updated",
          entity_type: "contact",
          entity_id: app.id,
          entity_label: app.name,
        });
      },

      deleteContact: async (idStr) => {
        await contactDb.archiveContact(idStr);
        set((s) => ({
          contacts: s.contacts.filter((x) => x.id !== idStr),
          viloOpportunities: s.viloOpportunities.map((o) =>
            o.primaryContactId === idStr ? { ...o, primaryContactId: undefined } : o
          ),
        }));
      },

      addViloOpportunity: async (o) => {
        const insert = viloToDbInsert(o) as InsertViloOpportunity;
        const row = await viloDb.createViloOpportunity(insert);
        const app = viloRowToApp(row as ViloOpportunityRow);
        set((s) => ({ viloOpportunities: [...s.viloOpportunities, app] }));
        void logActivity({
          action: "opportunity_created",
          entity_type: "vilo_opportunity",
          entity_id: app.id,
          entity_label: app.companyName,
        });
        return app;
      },

      updateViloOpportunity: async (idStr, patch) => {
        const dbPatch = viloToDbUpdate(patch) as Partial<InsertViloOpportunity>;
        const row = await viloDb.updateViloOpportunity({ id: idStr, ...dbPatch } as UpdateViloOpportunity);
        const app = viloRowToApp(row as ViloOpportunityRow);
        set((s) => ({ viloOpportunities: s.viloOpportunities.map((x) => (x.id === idStr ? app : x)) }));
        const patchKeys = (Object.keys(patch) as (keyof ViloOpportunity)[]).filter((k) => patch[k] !== undefined);
        const stageOnly =
          patchKeys.length > 0 &&
          patchKeys.every((k) => VILO_STAGE_LOG_KEYS.has(k as string)) &&
          patch.status !== undefined;
        if (stageOnly) {
          void logActivity({
            action: "opportunity_stage_changed",
            entity_type: "vilo_opportunity",
            entity_id: idStr,
            entity_label: String(patch.status),
          });
        } else {
          void logActivity({
            action: "opportunity_updated",
            entity_type: "vilo_opportunity",
            entity_id: idStr,
            entity_label: app.companyName,
          });
        }
      },

      deleteViloOpportunity: async (idStr) => {
        await viloDb.archiveViloOpportunity(idStr);
        set((s) => ({
          viloOpportunities: s.viloOpportunities.filter((x) => x.id !== idStr),
          tasks: s.tasks.filter((t) => !(t.entityType === "vilo_opportunity" && t.entityId === idStr)),
        }));
      },

      setViloStage: async (idStr, status) => {
        const prev = get().viloOpportunities.find((x) => x.id === idStr);
        if (!prev) return;
        const t = now();
        const patch: Partial<ViloOpportunity> = { status };
        if (status === "Feasibility Sent" && !prev.feasibilitySentAt) patch.feasibilitySentAt = t;
        if (status === "Budget / CTA" && prev.status !== "Budget / CTA" && !prev.negotiationEnteredAt) {
          patch.negotiationEnteredAt = t;
        }
        if (status === "Closed Won" && !prev.closedWonAt) patch.closedWonAt = t;
        if (status === "Closed Lost" && !prev.closedLostAt) patch.closedLostAt = t;
        await get().updateViloOpportunity(idStr, patch);
      },

      addPatientLead: async (l) => {
        const insert = patientToDbInsert(l) as InsertPatientLead;
        const row = await vitalisDb.createPatientLead(insert);
        const app = patientRowToApp(row as PatientLeadRow);
        set((s) => ({ patientLeads: [...s.patientLeads, app] }));
        void logActivity({
          action: "lead_created",
          entity_type: "patient_lead",
          entity_id: app.id,
          entity_label: app.fullName,
        });
        return app;
      },

      updatePatientLead: async (idStr, patch) => {
        const row = await vitalisDb.updatePatientLead({
          id: idStr,
          ...(patientToDbUpdate(patch) as Partial<InsertPatientLead>),
        } as UpdatePatientLead);
        const app = patientRowToApp(row as PatientLeadRow);
        set((s) => ({ patientLeads: s.patientLeads.map((x) => (x.id === idStr ? app : x)) }));
        const patchKeys = (Object.keys(patch) as (keyof PatientLead)[]).filter((k) => patch[k] !== undefined);
        const stageOnly =
          patchKeys.length === 1 && patchKeys[0] === "currentStage" && patch.currentStage !== undefined;
        if (stageOnly) {
          void logActivity({
            action: "lead_stage_changed",
            entity_type: "patient_lead",
            entity_id: idStr,
            entity_label: String(patch.currentStage),
          });
        } else {
          void logActivity({
            action: "lead_updated",
            entity_type: "patient_lead",
            entity_id: idStr,
            entity_label: app.fullName,
          });
        }
      },

      deletePatientLead: async (idStr) => {
        const label = get().patientLeads.find((x) => x.id === idStr)?.fullName;
        await vitalisDb.archivePatientLead(idStr);
        set((s) => ({
          patientLeads: s.patientLeads.filter((x) => x.id !== idStr),
          tasks: s.tasks.filter((t) => !(t.entityType === "patient_lead" && t.entityId === idStr)),
        }));
        void logActivity({
          action: "lead_deleted",
          entity_type: "patient_lead",
          entity_id: idStr,
          entity_label: label,
        });
      },

      setVitalisStage: async (idStr, currentStage) => {
        await get().updatePatientLead(idStr, { currentStage });
      },

      addTask: async (t) => {
        const insert = taskToDbInsert(t) as InsertTask;
        const row = await taskDb.createTask(insert);
        const app = taskRowToApp(row as TaskRow);
        set((s) => ({ tasks: [...s.tasks, app] }));
        void logActivity({
          action: "task_created",
          entity_type: "task",
          entity_id: app.id,
          entity_label: app.title,
        });
        return app;
      },

      updateTask: (idStr, patch) =>
        set((s) => ({
          tasks: s.tasks.map((x) => (x.id === idStr ? { ...x, ...patch } : x)),
        })),

      toggleTaskCompleted: async (idStr) => {
        const prev = get().tasks.find((x) => x.id === idStr);
        if (!prev) return;
        const row = await taskDb.toggleTask(idStr, !prev.completed);
        const app = taskRowToApp(row as TaskRow);
        set((s) => ({ tasks: s.tasks.map((x) => (x.id === idStr ? app : x)) }));
        if (app.completed) {
          void logActivity({
            action: "task_completed",
            entity_type: "task",
            entity_id: idStr,
            entity_label: app.title,
          });
        }
      },

      deleteTask: async (idStr) => {
        const title = get().tasks.find((x) => x.id === idStr)?.title;
        await taskDb.deleteTask(idStr);
        set((s) => ({ tasks: s.tasks.filter((x) => x.id !== idStr) }));
        void logActivity({
          action: "task_deleted",
          entity_type: "task",
          entity_id: idStr,
          entity_label: title,
        });
      },
    }),
    {
      name: "vilo-crm-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    }
  )
);
