export type FeedbackCategory =
  | 'Reliability'
  | 'Support'
  | 'FieldSupport'
  | 'Testimonials'
  | 'Installation'
  | 'Billing';

export type StaffDepartment = 'Support' | 'Billing' | 'Field Operations';

export interface StaffProfile {
  id: string;
  name: string;
  role: string;
  department: StaffDepartment;
  categories: FeedbackCategory[];
  region?: string;
}

export const supportStaff: StaffProfile[] = [
  { id: 'support-victoria-fokorede', name: 'Victoria Fokorede', role: 'Support Agent', department: 'Support', categories: ['Support'] },
  { id: 'support-aishat-hamzat', name: 'Aishat Hamzat', role: 'Support Agent', department: 'Support', categories: ['Support'] },
  { id: 'support-adekomoya-joseph', name: 'Adekomoya Joseph', role: 'Support Agent', department: 'Support', categories: ['Support'] },
  { id: 'support-olusegun-oluwanishola', name: 'Olusegun Oluwanishola', role: 'Support Agent', department: 'Support', categories: ['Support'] },
  { id: 'support-babatunde-christianah', name: 'Babatunde Christianah', role: 'Support Agent', department: 'Support', categories: ['Support'] },
];

export const billingStaff: StaffProfile[] = [
  { id: 'billing-dorcas', name: 'Dorcas', role: 'Billing Agent', department: 'Billing', categories: ['Billing'] },
  { id: 'billing-stella', name: 'Stella', role: 'Billing Agent', department: 'Billing', categories: ['Billing'] },
];

export const fieldTechnicians: StaffProfile[] = [
  { id: 'field-lukmon-obasa', name: 'Lukmon Obasa', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Akure' },
  { id: 'field-christian-adejo', name: 'Christian Adejo', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Akure' },
  { id: 'field-habeeb-hussein', name: 'Habeeb Hussein', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Ibadan' },
  { id: 'field-joseph-dung-n', name: 'Joseph Dung N', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Ibadan' },
  { id: 'field-alowo-temitope', name: 'Alowo Temitope', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Ibadan' },
  { id: 'field-timilehin-alabi', name: 'Timilehin Alabi', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Ibadan' },
  { id: 'field-adekunle-ademiju', name: 'Adekunle Ademiju', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Ibadan' },
  { id: 'field-adebisi-ogusola', name: 'Adebisi Ogusola', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Abeokuta' },
  { id: 'field-kehinde-itehinola', name: 'Kehinde Itehinola', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Abeokuta' },
  { id: 'field-olopade-olusegun', name: 'Olopade Olusegun', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Abeokuta' },
  { id: 'field-mubarak-raji', name: 'Mubarak Raji', role: 'Field Technician', department: 'Field Operations', categories: ['FieldSupport', 'Installation'], region: 'Osogbo' },
];

export const staffRoster: StaffProfile[] = [
  ...supportStaff,
  ...billingStaff,
  ...fieldTechnicians,
];
