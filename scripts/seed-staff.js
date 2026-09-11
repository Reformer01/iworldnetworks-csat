#!/usr/bin/env node
/**
 * Staff Seed Script
 * Populates Firestore with backend support staff data
 * 
 * Usage: node scripts/seed-staff.js
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
const serviceAccountPath = join(__dirname, '..', '.service-account.json');
let serviceAccount;

try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
} catch (e) {
  console.error('Service account not found. Please create .service-account.json');
  process.exit(1);
}

const app = getApps().length === 0 
  ? initializeApp({ credential: cert(serviceAccount) })
  : getApps()[0];

const db = getFirestore(app);

// Backend support staff data
const backendStaff = [
  {
    id: 'backend-yusuf-femi',
    name: 'Yusuf Femi',
    role: 'Back-end Support',
    department: 'Support',
    categories: ['Support', 'Technical'],
    email: 'yusuf.femi@iworldnetworks.net',
    phone: '+234-800-000-0001',
    isActive: true,
    hireDate: '2023-01-15',
    skills: ['Network Troubleshooting', 'Fiber Optics', 'Router Configuration', 'BGP/OSPF'],
    targetTicketsPerDay: 15,
    targetResolutionTimeHours: 4,
    targetFCR: 85, // percentage
    targetSLACompliance: 95, // percentage
  },
  {
    id: 'backend-ibrahim-gbadamosi',
    name: 'Ibrahim Gbadamosi',
    role: 'Back-end Support',
    department: 'Support',
    categories: ['Support', 'Technical'],
    email: 'ibrahim.gbadamosi@iworldnetworks.net',
    phone: '+234-800-000-0002',
    isActive: true,
    hireDate: '2023-03-22',
    skills: ['Wireless Networks', 'MikroTik', 'Ubiquiti', 'QoS Configuration'],
    targetTicketsPerDay: 15,
    targetResolutionTimeHours: 4,
    targetFCR: 85,
    targetSLACompliance: 95,
  },
  {
    id: 'backend-omotunde-olamide',
    name: 'Omotunde Olamide',
    role: 'Back-end Support',
    department: 'Support',
    categories: ['Support', 'Technical'],
    email: 'omotunde.olamide@iworldnetworks.net',
    phone: '+234-800-000-0003',
    isActive: true,
    hireDate: '2023-06-10',
    skills: ['Fiber Splicing', 'OTDR Testing', 'GPON/XGS-PON', 'OLT Management'],
    targetTicketsPerDay: 15,
    targetResolutionTimeHours: 4,
    targetFCR: 85,
    targetSLACompliance: 95,
  },
  {
    id: 'backend-tunji-adebayo',
    name: 'Tunji Adebayo',
    role: 'Back-end Support',
    department: 'Support',
    categories: ['Support', 'Technical'],
    email: 'tunji.adebayo@iworldnetworks.net',
    phone: '+234-800-000-0004',
    isActive: true,
    hireDate: '2023-09-01',
    skills: ['Core Network', 'MPLS', 'VPN Configuration', 'Firewall Management'],
    targetTicketsPerDay: 15,
    targetResolutionTimeHours: 4,
    targetFCR: 85,
    targetSLACompliance: 95,
  },
];

async function seedStaff() {
  console.log('🌱 Seeding backend support staff...');
  
  const batch = db.batch();
  const staffCollection = db.collection('staff');
  
  for (const staff of backendStaff) {
    const docRef = staffCollection.doc(staff.id);
    const existing = await docRef.get();
    
    if (existing.exists) {
      console.log(`⚠️  Staff ${staff.name} (${staff.id}) already exists, updating...`);
      batch.set(docRef, {
        ...staff,
        updatedAt: Date.now(),
      }, { merge: true });
    } else {
      console.log(`✅ Adding staff: ${staff.name} (${staff.id})`);
      batch.set(docRef, {
        ...staff,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  
  // Also add front-end support staff for completeness
  const frontendStaff = [
    {
      id: 'support-victoria-fokorede',
      name: 'Victoria Fokorede',
      role: 'Front-end Support',
      department: 'Support',
      categories: ['Support'],
      email: 'victoria.fokorede@iworldnetworks.net',
      phone: '+234-800-000-0010',
      isActive: true,
      hireDate: '2022-05-01',
      skills: ['Customer Service', 'Ticket Triage', 'Basic Troubleshooting', 'CRM'],
      targetTicketsPerDay: 20,
      targetResolutionTimeHours: 2,
      targetFCR: 70,
      targetSLACompliance: 90,
    },
    {
      id: 'support-aishat-hamzat',
      name: 'Aishat Hamzat',
      role: 'Front-end Support',
      department: 'Support',
      categories: ['Support'],
      email: 'aishat.hamzat@iworldnetworks.net',
      phone: '+234-800-000-0011',
      isActive: true,
      hireDate: '2022-08-15',
      skills: ['Customer Service', 'Billing Support', 'Account Management', 'CRM'],
      targetTicketsPerDay: 20,
      targetResolutionTimeHours: 2,
      targetFCR: 70,
      targetSLACompliance: 90,
    },
    {
      id: 'support-adekomoya-joseph',
      name: 'Adekomoya Joseph',
      role: 'Front-end Support',
      department: 'Support',
      categories: ['Support'],
      email: 'adekomoya.joseph@iworldnetworks.net',
      phone: '+234-800-000-0012',
      isActive: true,
      hireDate: '2023-01-20',
      skills: ['Customer Service', 'Technical Support', 'Escalation Handling', 'CRM'],
      targetTicketsPerDay: 20,
      targetResolutionTimeHours: 2,
      targetFCR: 70,
      targetSLACompliance: 90,
    },
    {
      id: 'support-olusegun-oluwanishola',
      name: 'Olusegun Oluwanishola',
      role: 'Front-end Support',
      department: 'Support',
      categories: ['Support'],
      email: 'olusegun.oluwanishola@iworldnetworks.net',
      phone: '+234-800-000-0013',
      isActive: true,
      hireDate: '2023-02-10',
      skills: ['Customer Service', 'Technical Support', 'Network Basics', 'CRM'],
      targetTicketsPerDay: 20,
      targetResolutionTimeHours: 2,
      targetFCR: 70,
      targetSLACompliance: 90,
    },
    {
      id: 'support-babatunde-christianah',
      name: 'Babatunde Christianah',
      role: 'Front-end Support',
      department: 'Support',
      categories: ['Support'],
      email: 'babatunde.christianah@iworldnetworks.net',
      phone: '+234-800-000-0014',
      isActive: true,
      hireDate: '2023-05-05',
      skills: ['Customer Service', 'Complaint Handling', 'Retention', 'CRM'],
      targetTicketsPerDay: 20,
      targetResolutionTimeHours: 2,
      targetFCR: 70,
      targetSLACompliance: 90,
    },
  ];

  for (const staff of frontendStaff) {
    const docRef = staffCollection.doc(staff.id);
    const existing = await docRef.get();
    
    if (existing.exists) {
      console.log(`⚠️  Staff ${staff.name} (${staff.id}) already exists, updating...`);
      batch.set(docRef, {
        ...staff,
        updatedAt: Date.now(),
      }, { merge: true });
    } else {
      console.log(`✅ Adding staff: ${staff.name} (${staff.id})`);
      batch.set(docRef, {
        ...staff,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  // Billing staff
  const billingStaff = [
    {
      id: 'billing-akinola-stella',
      name: 'Akinola Stella',
      role: 'Billing Agent',
      department: 'Billing',
      categories: ['Billing'],
      email: 'akinola.stella@iworldnetworks.net',
      phone: '+234-800-000-0020',
      isActive: true,
      hireDate: '2022-03-01',
      skills: ['Billing', 'Invoicing', 'Payment Processing', 'Account Reconciliation'],
      targetTicketsPerDay: 25,
      targetResolutionTimeHours: 1,
      targetFCR: 80,
      targetSLACompliance: 95,
    },
    {
      id: 'billing-olayoole-dorcas',
      name: 'Olayoole Dorcas',
      role: 'Billing Agent',
      department: 'Billing',
      categories: ['Billing'],
      email: 'olayoole.dorcas@iworldnetworks.net',
      phone: '+234-800-000-0021',
      isActive: true,
      hireDate: '2022-07-15',
      skills: ['Billing', 'Payment Processing', 'Refunds', 'Account Reconciliation'],
      targetTicketsPerDay: 25,
      targetResolutionTimeHours: 1,
      targetFCR: 80,
      targetSLACompliance: 95,
    },
  ];

  for (const staff of billingStaff) {
    const docRef = staffCollection.doc(staff.id);
    const existing = await docRef.get();
    
    if (existing.exists) {
      console.log(`⚠️  Staff ${staff.name} (${staff.id}) already exists, updating...`);
      batch.set(docRef, {
        ...staff,
        updatedAt: Date.now(),
      }, { merge: true });
    } else {
      console.log(`✅ Adding staff: ${staff.name} (${staff.id})`);
      batch.set(docRef, {
        ...staff,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  // Field operations staff
  const fieldStaff = [
    {
      id: 'field-lukmon-obasa',
      name: 'Lukmon Obasa',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Ondo',
      email: 'lukmon.obasa@iworldnetworks.net',
      phone: '+234-800-000-0030',
      isActive: true,
      hireDate: '2022-02-01',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
    {
      id: 'field-christian-adejo',
      name: 'Christian Adejo',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Ondo',
      email: 'christian.adejo@iworldnetworks.net',
      phone: '+234-800-000-0031',
      isActive: true,
      hireDate: '2022-04-15',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
    {
      id: 'field-habeeb-hussein',
      name: 'Habeeb Hussein',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Oyo',
      email: 'habeeb.hussein@iworldnetworks.net',
      phone: '+234-800-000-0032',
      isActive: true,
      hireDate: '2022-06-01',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
    {
      id: 'field-joseph-dung-n',
      name: 'Joseph Dung N',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Oyo',
      email: 'joseph.dung@iworldnetworks.net',
      phone: '+234-800-000-0033',
      isActive: true,
      hireDate: '2022-08-15',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
    {
      id: 'field-alowo-temitope',
      name: 'Alowo Temitope',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Oyo',
      email: 'alowo.temitope@iworldnetworks.net',
      phone: '+234-800-000-0034',
      isActive: true,
      hireDate: '2022-10-01',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
    {
      id: 'field-timilehin-alabi',
      name: 'Timilehin Alabi',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Oyo',
      email: 'timilehin.alabi@iworldnetworks.net',
      phone: '+234-800-000-0035',
      isActive: true,
      hireDate: '2023-01-15',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
    {
      id: 'field-adekunle-ademiju',
      name: 'Adekunle Ademiju',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Oyo',
      email: 'adekunle.ademiju@iworldnetworks.net',
      phone: '+234-800-000-0036',
      isActive: true,
      hireDate: '2023-03-01',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
    {
      id: 'field-adebisi-ogusola',
      name: 'Adebisi Ogusola',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Ogun',
      email: 'adebisi.ogusola@iworldnetworks.net',
      phone: '+234-800-000-0037',
      isActive: true,
      hireDate: '2022-11-01',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
    {
      id: 'field-kehinde-itehinola',
      name: 'Kehinde Itehinola',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Ogun',
      email: 'kehinde.itehinola@iworldnetworks.net',
      phone: '+234-800-000-0038',
      isActive: true,
      hireDate: '2022-12-01',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
    {
      id: 'field-olopade-olusegun',
      name: 'Olopade Olusegun',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Ogun',
      email: 'olopade.olusegun@iworldnetworks.net',
      phone: '+234-800-000-0039',
      isActive: true,
      hireDate: '2023-02-15',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
    {
      id: 'field-mubarak-raji',
      name: 'Mubarak Raji',
      role: 'Field Technician',
      department: 'Field Operations',
      categories: ['FieldSupport', 'Installation'],
      region: 'Osun',
      email: 'mubarak.raji@iworldnetworks.net',
      phone: '+234-800-000-0040',
      isActive: true,
      hireDate: '2022-09-01',
      skills: ['Fiber Installation', 'Splicing', 'ONT Configuration', 'Customer Premises'],
      targetTicketsPerDay: 8,
      targetResolutionTimeHours: 6,
      targetFCR: 75,
      targetSLACompliance: 90,
    },
  ];

  for (const staff of fieldStaff) {
    const docRef = staffCollection.doc(staff.id);
    const existing = await docRef.get();
    
    if (existing.exists) {
      console.log(`⚠️  Staff ${staff.name} (${staff.id}) already exists, updating...`);
      batch.set(docRef, {
        ...staff,
        updatedAt: Date.now(),
      }, { merge: true });
    } else {
      console.log(`✅ Adding staff: ${staff.name} (${staff.id})`);
      batch.set(docRef, {
        ...staff,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  await batch.commit();
  console.log('\n✅ Staff seeding completed successfully!');
  
  // Print summary
  const totalStaff = backendStaff.length + frontendStaff.length + billingStaff.length + fieldStaff.length;
  console.log(`\n📊 Total staff seeded: ${totalStaff}`);
  console.log(`   - Backend Support: ${backendStaff.length}`);
  console.log(`   - Frontend Support: ${frontendStaff.length}`);
  console.log(`   - Billing: ${billingStaff.length}`);
  console.log(`   - Field Operations: ${fieldStaff.length}`);
}

seedStaff()
  .then(() => {
    console.log('\n🎉 Seeding complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });