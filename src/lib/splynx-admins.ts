export const SPLYNX_ADMINS: Record<number, string> = {
  1: 'Main Admin',
  2: 'Splynx admin',
  3: 'Splynx remote support',
  5: 'Richard Rwang',
  7: 'oluwafemi oladipupo Yusuf',
  8: 'Jude Alawode',
  9: 'Adetunji Adebayo',
  10: 'Alaka Segun',
  11: 'Iworld Networks',
  12: 'gyang bard',
  13: 'Kolade Adegelu',
  14: 'Titilade Bakare',
  15: 'Akinola Stella',
  16: 'Tosin Adedeji',
  17: 'Mathew Alli',
  18: 'Adewale Adekomaya',
  19: 'Olusegun Oluwanishola',
  21: 'Emmanuel Oladimeji',
  22: 'Oke Janet',
  24: 'olamide omolekan',
  25: 'sulaimonadekunle',
  26: 'Dorcas Olayoole',
  27: 'Omotunde Olamide',
  29: 'Reformer Ejembi',
  30: 'Adeolu Oluwabiyi',
  31: 'Christianah Babatunde',
  32: 'Aishat Hamzat',
  33: 'Ruth Suleimon',
  34: 'Henry Adiene',
  35: 'Rachael',
  37: 'Esther Ajayi',
  38: 'Oreofe Alademehin',
  41: 'Kolade Adegelu',
  43: 'Jeffery Udoji',
  45: 'Elizabeth Tola',
  48: 'Kehinde Itehinola',
  49: 'Victoria Fakorede',
  50: 'Christian Adejo',
  51: 'Joseph Gbesoevi',
  52: 'Abiodun Kameyo',
  53: 'Michael Awodein',
  54: 'Habeebllahi Hussain',
  55: 'Opeyemi Adebisi',
  56: 'Sunday Oyekunle',
  57: 'Inyene Udoh',
  58: 'Lukmon Obasa',
  59: 'Timilehin Alabi',
  60: 'Ademiju Adekunle',
  61: 'Temitayo Alowo',
  62: 'Joseph Nyam',
  63: 'Mubarak Raji',
  64: 'Olopade Oluwasegun',
  65: 'Adebisi Ogunsola',
  66: 'Ibrahim Gbadamosi',
  67: 'Damilola Olatunji',
  68: 'Henry Ajayi',
  69: 'Tunde Somade',
  70: 'Alli Ashiru',
  71: 'Daniel Adenekan',
  72: 'Splynx Support',
  73: 'Ernest Okafor',
  74: 'SAHEED LAWAL',
  75: 'Agboola Isaac',
  76: 'Ibrahim Olowolagba',
  77: 'Stell Temp Password',
  78: 'Olumide Adelaja',
  79: 'Morenikeji Abiola',
};


export const SPLYNX_ADMIN_TO_STAFF: Record<number, string> = {
  // Front-end Support
  19: 'support-olusegun-oluwanishola',
  49: 'support-victoria-fokorede',
  31: 'support-babatunde-christianah',
  32: 'support-aishat-hamzat',
  // Confirmed Sep 2026: Splynx #18 "Adewale Adekomaya" IS roster
  // "Adekomoya Joseph" (same person, both name orders in use).
  18: 'support-adekomoya-joseph',
  // Back-end Support
  27: 'backend-omotide-olamide',
  66: 'backend-ibrahim-gbadamosi',
  // Billing
  15: 'billing-akinola-stella',
  26: 'billing-olayoole-dorcas',
  // Field Operations
  58: 'field-lukmon-obasa',
  61: 'field-alowo-temitayo',
  54: 'field-habeeb-hussein',
  60: 'field-adekunle-ademiju',
  63: 'field-mubarak-raji',
  53: 'field-michael-awodein',
  65: 'field-adebisi-ogunsola',
  48: 'field-kehinde-itehinola',
  64: 'field-oluwasegun-olopade',
};


export function resolveTicketAssignee(adminId: number | null | undefined): string | null {
  const id = Number(adminId) || 0;
  if (id <= 0) return null;
  const staffId = SPLYNX_ADMIN_TO_STAFF[id];
  if (staffId) return staffId;
  const name = SPLYNX_ADMINS[id];
  if (name) return name;
  return `splynx-admin-${id}`;
}
