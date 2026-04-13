import type { Priority, TaskChannel, ViloStage, VitalisStage } from "./constants";

export interface Organization {
  id: string;
  name: string;
  website?: string;
  notes?: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  organizationId: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  therapeuticArea?: string;
  notes?: string;
  createdAt: string;
}

export interface ViloOpportunity {
  id: string;
  organizationId?: string;
  primaryContactId?: string;
  companyName: string;
  contactName: string;
  role: string;
  email: string;
  phone: string;
  therapeuticArea: string;
  opportunityType: string;
  source: string;
  lastContactDate: string;
  nextFollowupDate: string;
  status: ViloStage;
  notes: string;
  potentialValue: string;
  priority: Priority;
  feasibilitySentAt?: string;
  negotiationEnteredAt?: string;
  closedWonAt?: string;
  closedLostAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientLead {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  preferredLanguage: string;
  ageRange: string;
  gender: string;
  conditionOrStudyInterest: string;
  sourceCampaign: string;
  zipCode: string;
  preferredContactChannel: string;
  lastContactDate: string;
  nextAction: string;
  currentStage: VitalisStage;
  screenFailReason: string;
  notes: string;
  firstOutreachAt?: string;
  respondedAt?: string;
  prescreenStartedAt?: string;
  appointmentAt?: string;
  appointmentOutcomeRecordedAt?: string;
  enrolledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  dueAt: string;
  channel: TaskChannel;
  priority: Priority;
  completed: boolean;
  entityType?: "vilo_opportunity" | "patient_lead";
  entityId?: string;
  notes?: string;
  createdAt: string;
}
