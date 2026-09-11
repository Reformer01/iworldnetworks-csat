import { TicketRole } from './sales-types';

export type FeedbackCategory = 'Reliability' | 'Support' | 'FieldSupport' | 'Testimonials' | 'Installation' | 'Billing';

export type StaffDepartment = 'Support' | 'Billing' | 'Field Operations';

export interface StaffProfile {
  id: string;
  name: string;
  role: string;
  department: StaffDepartment;
  categories: FeedbackCategory[];
  region?: string;
  ticketRole?: TicketRole;
}

export const supportStaff: StaffProfile[] = [
  { id: 'support-victoria-fokorede', name: 'Victoria Fokorede', role: 'Front-end Support', department: 'Support', categories: ['Support'] },
  { id: 'support-aishat-hamzat', name: 'Aishat Hamzat', role: 'Front-end Support', department: 'Support', categories: ['Support'] },
  { id: 'support-adekomoya-joseph', name: 'Adekomoya Joseph', role: 'Front-end Support', department: 'Support', categories: ['Support'] },
  {
    id: 'support-olusegun-oluwanishola',
    name: 'Olusegun Oluwanishola',
    role: 'Front-end Support',
    department: 'Support',
    categories: ['Support'],
  },
  {
    id: 'support-babatunde-christianah',
    name: 'Babatunde Christianah',
    role: 'Front-end Support',
    department: 'Support',
    categories: ['Support'],
  },
];

export const backendStaff: StaffProfile[] = [
  { id: 'backend-yusuf-femi', name: 'Yusuf Femi', role: 'Back-end Support', department: 'Support', categories: ['Support'] },
  { id: 'backend-ibrahim-gbadamosi', name: 'Ibrahim Gbadamosi', role: 'Back-end Support', department: 'Support', categories: ['Support'] },
  { id: 'backend-omotide-olamide', name: 'Omotunde Olamide', role: 'Back-end Support', department: 'Support', categories: ['Support'] },
  { id: 'backend-tunji-adebayo', name: 'Tunji Adebayo', role: 'Back-end Support', department: 'Support', categories: ['Support'] },
];

export const billingStaff: StaffProfile[] = [
  { id: 'billing-akinola-stella', name: 'Akinola Stella', role: 'Billing Agent', department: 'Billing', categories: ['Billing'] },
  { id: 'billing-olayoole-dorcas', name: 'Olayoole Dorcas', role: 'Billing Agent', department: 'Billing', categories: ['Billing'] },
];

export const fieldTechnicians: StaffProfile[] = [
  { id: 'field-lukmon-obasa', name: 'Lukmon Obasa', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Akure' },
  { id: 'field-alowo-temitayo', name: 'Alowo Temitayo', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Ibadan' },
  { id: 'field-habeeb-hussein', name: 'Habeeb Hussein', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Ibadan' },
  { id: 'field-adekunle-ademiju', name: 'Adekunle Ademiju', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Ibadan' },
  { id: 'field-mubarak-raji', name: 'Mubarak Raji', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Osogbo' },
  { id: 'field-michael-awodein', name: 'Michael Awodein', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: '—' },
  { id: 'field-adebisi-ogunsola', name: 'Adebisi Ogunsola', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Abeokuta' },
  { id: 'field-kehinde-itehinola', name: 'Kehinde Itehinola', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Abeokuta' },
  { id: 'field-oluwasegun-olopade', name: 'Oluwasegun Olopade', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Abeokuta' },
  { id: 'field-isaac-agboola', name: 'Isaac Agboola', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: '—' },
  { id: 'field-christian-adejo', name: 'Christian Adejo', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Akure' },
  { id: 'field-timileyin-alabi', name: 'Timileyin Alabi', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Ibadan' },
  { id: 'field-joseph-nyam', name: 'Joseph Nyam', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: '—' },
  { id: 'field-abiodun-kameyo', name: 'Abiodun Kameyo', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: '—' },
  { id: 'field-sunday-oyekunle', name: 'Sunday Oyekunle', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: '—' },
  { id: 'field-ibrahim-olowolagba', name: 'Ibrahim Olowolagba', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: '—' },
  { id: 'field-inyene-udo', name: 'Inyene Udo', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: '—' },
  { id: 'field-joseph-gbesoevi', name: 'Joseph Gbesoevi', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: '—' },
  { id: 'field-ernest-okafor', name: 'Ernest Okafor', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: '—' },
  { id: 'field-olawale-saheed', name: 'Olawale Saheed', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: '—' },
];

export const staffRoster: StaffProfile[] = [...supportStaff, ...backendStaff, ...billingStaff, ...fieldTechnicians];

const staffNameById = new Map(staffRoster.map((s) => [s.id, s.name]));

/**
 * Human name for a Ticket.assignedTo value: roster id → staff name,
 * Splynx full name → itself, null → 'Unassigned'. The ticket sync stores
 * roster ids for mapped admins, so the raw column reads like slugs.
 */
export function displayAssigneeName(assignedTo: string | null | undefined): string {
  if (!assignedTo) return 'Unassigned';
  return staffNameById.get(assignedTo) ?? assignedTo;
}
