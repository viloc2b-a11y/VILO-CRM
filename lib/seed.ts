import { todayISODate } from "./dates";
import type { Organization, Contact, ViloOpportunity, PatientLead, TaskItem } from "./types";

const now = new Date().toISOString();

export function seedOrganizations(): Organization[] {
  return [
    {
      id: "org-demo-1",
      name: "Nexus CRO",
      website: "https://example.com",
      notes: "Strategic CRO partner",
      createdAt: now,
    },
  ];
}

export function seedContacts(): Contact[] {
  return [
    {
      id: "con-demo-1",
      organizationId: "org-demo-1",
      name: "Alex Rivera",
      role: "BD Director",
      email: "alex@example.com",
      phone: "+1 555 0101",
      therapeuticArea: "Oncology",
      createdAt: now,
    },
  ];
}

export function seedViloOpportunities(): ViloOpportunity[] {
  const t = todayISODate();
  return [
    {
      id: "vilo-demo-1",
      organizationId: "org-demo-1",
      primaryContactId: "con-demo-1",
      companyName: "Nexus CRO",
      contactName: "Alex Rivera",
      role: "BD Director",
      email: "alex@example.com",
      phone: "+1 555 0101",
      therapeuticArea: "Oncology",
      opportunityType: "CRO",
      source: "Conference",
      lastContactDate: t,
      nextFollowupDate: t,
      status: "Feasibility Sent",
      notes: "Awaiting feasibility feedback.",
      potentialValue: "125000",
      priority: "High",
      feasibilitySentAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function seedPatientLeads(): PatientLead[] {
  const t = todayISODate();
  return [
    {
      id: "vit-demo-1",
      fullName: "Maria G.",
      phone: "+1 555 0202",
      email: "maria@example.com",
      preferredLanguage: "ES",
      ageRange: "45-54",
      gender: "Female",
      conditionOrStudyInterest: "Type 2 diabetes",
      sourceCampaign: "Meta / Diabetes Q1",
      zipCode: "33101",
      preferredContactChannel: "WhatsApp",
      lastContactDate: t,
      nextAction: t,
      currentStage: "Prescreen Started",
      screenFailReason: "",
      notes: "Interested in evening visits.",
      prescreenStartedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function seedTasks(): TaskItem[] {
  const due = new Date();
  due.setDate(due.getDate() - 1);
  return [
    {
      id: "task-demo-1",
      title: "Follow up feasibility — Nexus CRO",
      dueAt: due.toISOString(),
      channel: "vilo",
      priority: "High",
      completed: false,
      entityType: "vilo_opportunity",
      entityId: "vilo-demo-1",
      createdAt: now,
    },
  ];
}
