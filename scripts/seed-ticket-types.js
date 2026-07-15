#!/usr/bin/env node
/**
 * Ticket Types & Complaint Types Seed Script
 * Populates Firestore with ticket categories, complaint types, and SLA definitions
 * 
 * Usage: node scripts/seed-ticket-types.js
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Complaint types with SLA definitions
const complaintTypes = [
  {
    id: 'no-connectivity',
    name: 'No Connectivity',
    description: 'Customer has no internet connection at all',
    category: 'Technical',
    priority: 1, // Critical
    slaHours: 4,
    escalationHours: 2,
    autoEscalate: true,
    requiresFieldVisit: false,
    typicalCauses: [
      'Fiber cut',
      'Equipment failure',
      'Power outage at PoP',
      'Port configuration error',
      'ONT/Modem failure'
    ],
    troubleshootingSteps: [
      'Check ONT/Modem status lights',
      'Verify port status on OLT/switch',
      'Check for fiber cuts in the area',
      'Verify power at customer premises',
      'Remote reboot of CPE'
    ],
  },
  {
    id: 'slow-speed',
    name: 'Slow Speed',
    description: 'Customer experiencing slower than subscribed speeds',
    category: 'Technical',
    priority: 2, // High
    slaHours: 8,
    escalationHours: 4,
    autoEscalate: true,
    requiresFieldVisit: false,
    typicalCauses: [
      'Network congestion',
      'WiFi interference',
      'CPE limitations',
      'Port speed misconfiguration',
      'QoS/policing issues'
    ],
    troubleshootingSteps: [
      'Run speed test wired directly to CPE',
      'Check for WiFi interference',
      'Verify port speed configuration',
      'Check for QoS/policing on port',
      'Review bandwidth utilization graphs'
    ],
  },
  {
    id: 'hardware-issue',
    name: 'Hardware Issue',
    description: 'Customer equipment (ONT/Modem/Router) malfunction',
    category: 'Technical',
    priority: 2, // High
    slaHours: 8,
    escalationHours: 4,
    autoEscalate: true,
    requiresFieldVisit: true,
    typicalCauses: [
      'ONT/Modem hardware failure',
      'Power adapter failure',
      'Port damage',
      'Firmware corruption',
      'Overheating'
    ],
    troubleshootingSteps: [
      'Power cycle the equipment',
      'Check power adapter',
      'Verify LED status indicators',
      'Check for physical damage',
      'Schedule field replacement if needed'
    ],
  },
  {
    id: 'installation-issue',
    name: 'Installation Issue',
    description: 'New installation problems or re-installation requests',
    category: 'Installation',
    priority: 2, // High
    slaHours: 24,
    escalationHours: 12,
    autoEscalate: false,
    requiresFieldVisit: true,
    typicalCauses: [
      'Incorrect wiring',
      'Missing equipment',
      'Configuration errors',
      'Site access issues',
      'Missing permits/approvals'
    ],
    troubleshootingSteps: [
      'Verify installation schedule',
      'Check equipment availability',
      'Confirm site access',
      'Verify configuration templates',
      'Dispatch field technician'
    ],
  },
  {
    id: 'billing-issue',
    name: 'Billing Issue',
    description: 'Invoice disputes, payment issues, or billing inquiries',
    category: 'Billing',
    priority: 3, // Medium
    slaHours: 48,
    escalationHours: 24,
    autoEscalate: false,
    requiresFieldVisit: false,
    typicalCauses: [
      'Incorrect invoice amount',
      'Payment not reflected',
      'Service not provisioned but billed',
      'Promotional pricing not applied',
      'Duplicate charges'
    ],
    troubleshootingSteps: [
      'Verify invoice against service provisioning',
      'Check payment status in billing system',
      'Review promotional eligibility',
      'Check for duplicate invoices',
      'Process credit/refund if applicable'
    ],
  },
  {
    id: 'other',
    name: 'Other',
    description: 'Any other issue not covered by the above categories',
    category: 'Other',
    priority: 3, // Medium
    slaHours: 24,
    escalationHours: 12,
    autoEscalate: false,
    requiresFieldVisit: false,
    typicalCauses: [
      'General inquiries',
      'Service requests',
      'Account changes',
      'Complaints',
      'Feedback'
    ],
    troubleshootingSteps: [
      'Categorize the request',
      'Assign to appropriate team',
      'Provide initial response',
      'Follow standard process'
    ],
  },
];

// SLA Definitions by Priority
const slaDefinitions = [
  {
    id: 'priority-1',
    name: 'Critical - No Connectivity',
    priority: 1,
    description: 'Complete service outage affecting customer',
    responseTimeHours: 1,
    resolutionTimeHours: 4,
    escalationTimeHours: 2,
    businessHoursOnly: false,
    penalties: {
      breach1Hour: 10000, // Naira per hour
      breach4Hours: 50000,
      breach8Hours: 100000,
    },
    notificationChannels: ['SMS', 'Email', 'Push', 'Phone Call'],
  },
  {
    id: 'priority-2',
    name: 'High - Degraded Service',
    priority: 2,
    description: 'Service degraded but not completely down',
    responseTimeHours: 2,
    resolutionTimeHours: 8,
    escalationTimeHours: 4,
    businessHoursOnly: false,
    penalties: {
      breach2Hours: 5000,
      breach8Hours: 25000,
      breach24Hours: 50000,
    },
    notificationChannels: ['SMS', 'Email', 'Push'],
  },
  {
    id: 'priority-3',
    name: 'Medium - Billing/Inquiries',
    priority: 3,
    description: 'Billing issues, general inquiries, non-urgent requests',
    responseTimeHours: 4,
    resolutionTimeHours: 48,
    escalationTimeHours: 24,
    businessHoursOnly: true,
    businessHours: {
      start: '08:00',
      end: '17:00',
      timezone: 'Africa/Lagos',
      workingDays: [1, 2, 3, 4, 5], // Mon-Fri
    },
    penalties: {
      breach4Hours: 2000,
      breach24Hours: 10000,
      breach48Hours: 20000,
    },
    notificationChannels: ['Email', 'Push'],
  },
  {
    id: 'priority-4',
    name: 'Low - General Requests',
    priority: 4,
    description: 'General requests, feedback, non-urgent changes',
    responseTimeHours: 8,
    resolutionTimeHours: 120, // 5 business days
    escalationTimeHours: 48,
    businessHoursOnly: true,
    businessHours: {
      start: '08:00',
      end: '17:00',
      timezone: 'Africa/Lagos',
      workingDays: [1, 2, 3, 4, 5],
    },
    penalties: {},
    notificationChannels: ['Email'],
  },
];

// Ticket Status Definitions
const ticketStatuses = [
  {
    id: 'open',
    name: 'Open',
    description: 'Ticket created, awaiting assignment',
    color: '#3B82F6', // blue
    order: 1,
    isTerminal: false,
    allowedTransitions: ['assigned', 'closed'],
    slaClockRunning: true,
  },
  {
    id: 'assigned',
    name: 'Assigned',
    description: 'Ticket assigned to support agent',
    color: '#8B5CF6', // purple
    order: 2,
    isTerminal: false,
    allowedTransitions: ['in_progress', 'escalated', 'closed'],
    slaClockRunning: true,
  },
  {
    id: 'in_progress',
    name: 'In Progress',
    description: 'Agent actively working on ticket',
    color: '#F59E0B', // amber
    order: 3,
    isTerminal: false,
    allowedTransitions: ['resolved', 'escalated', 'on_hold', 'closed'],
    slaClockRunning: true,
  },
  {
    id: 'on_hold',
    name: 'On Hold',
    description: 'Waiting for customer response or external dependency',
    color: '#6B7280', // gray
    order: 4,
    isTerminal: false,
    allowedTransitions: ['in_progress', 'escalated', 'closed'],
    slaClockRunning: false, // SLA pauses on hold
  },
  {
    id: 'escalated',
    name: 'Escalated',
    description: 'Escalated to higher tier or management',
    color: '#EF4444', // red
    order: 5,
    isTerminal: false,
    allowedTransitions: ['in_progress', 'resolved', 'closed'],
    slaClockRunning: true,
  },
  {
    id: 'resolved',
    name: 'Resolved',
    description: 'Issue resolved, awaiting customer confirmation',
    color: '#10B981', // green
    order: 6,
    isTerminal: false,
    allowedTransitions: ['closed', 'reopened'],
    slaClockRunning: false,
  },
  {
    id: 'closed',
    name: 'Closed',
    description: 'Ticket fully closed and completed',
    color: '#6B7280', // gray
    order: 7,
    isTerminal: true,
    allowedTransitions: ['reopened'],
    slaClockRunning: false,
  },
  {
    id: 'reopened',
    name: 'Reopened',
    description: 'Previously closed ticket reopened',
    color: '#F59E0B', // amber
    order: 8,
    isTerminal: false,
    allowedTransitions: ['assigned', 'in_progress', 'closed'],
    slaClockRunning: true,
  },
];

// Ticket Priorities
const ticketPriorities = [
  {
    id: 1,
    name: 'Critical',
    label: 'P1 - Critical',
    color: '#DC2626',
    description: 'Complete service outage, immediate attention required',
    sortOrder: 1,
  },
  {
    id: 2,
    name: 'High',
    label: 'P2 - High',
    color: '#EA580C',
    description: 'Service degraded, urgent attention needed',
    sortOrder: 2,
  },
  {
    id: 3,
    name: 'Medium',
    label: 'P3 - Medium',
    color: '#F59E0B',
    description: 'Standard issue, normal response time',
    sortOrder: 3,
  },
  {
    id: 4,
    name: 'Low',
    label: 'P4 - Low',
    color: '#6B7280',
    description: 'General inquiry or non-urgent request',
    sortOrder: 4,
  },
];

// Ticket Channels
const ticketChannels = [
  { id: 'phone', name: 'Phone', icon: 'phone', color: '#3B82F6' },
  { id: 'email', name: 'Email', icon: 'mail', color: '#10B981' },
  { id: 'web', name: 'Web Portal', icon: 'globe', color: '#8B5CF6' },
  { id: 'walkin', name: 'Walk-in', icon: 'user', color: '#F59E0B' },
  { id: 'whatsapp', name: 'WhatsApp', icon: 'message-circle', color: '#25D366' },
  { id: 'chatbot', name: 'Chatbot', icon: 'bot', color: '#6366F1' },
  { id: 'field', name: 'Field App', icon: 'truck', color: '#EF4444' },
];

async function seedTicketTypes() {
  console.log('🌱 Seeding ticket types and complaint types...');
  
  const batch = db.batch();
  
  // Seed complaint types
  const complaintTypesCollection = db.collection('complaint_types');
  for (const complaint of complaintTypes) {
    const docRef = complaintTypesCollection.doc(complaint.id);
    const existing = await docRef.get();
    
    if (existing.exists) {
      console.log(`⚠️  Complaint type ${complaint.name} (${complaint.id}) already exists, updating...`);
      batch.set(docRef, {
        ...complaint,
        updatedAt: Date.now(),
      }, { merge: true });
    } else {
      console.log(`✅ Adding complaint type: ${complaint.name}`);
      batch.set(docRef, {
        ...complaint,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  
  // Seed SLA definitions
  const slaCollection = db.collection('sla_definitions');
  for (const sla of slaDefinitions) {
    const docRef = slaCollection.doc(sla.id);
    const existing = await docRef.get();
    
    if (existing.exists) {
      console.log(`⚠️  SLA ${sla.name} (${sla.id}) already exists, updating...`);
      batch.set(docRef, {
        ...sla,
        updatedAt: Date.now(),
      }, { merge: true });
    } else {
      console.log(`✅ Adding SLA: ${sla.name}`);
      batch.set(docRef, {
        ...sla,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  
  // Seed ticket statuses
  const statusCollection = db.collection('ticket_statuses');
  for (const status of ticketStatuses) {
    const docRef = statusCollection.doc(status.id);
    const existing = await docRef.get();
    
    if (existing.exists) {
      console.log(`⚠️  Status ${status.name} (${status.id}) already exists, updating...`);
      batch.set(docRef, {
        ...status,
        updatedAt: Date.now(),
      }, { merge: true });
    } else {
      console.log(`✅ Adding status: ${status.name}`);
      batch.set(docRef, {
        ...status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  
  // Seed ticket priorities
  const priorityCollection = db.collection('ticket_priorities');
  for (const priority of ticketPriorities) {
    const docRef = priorityCollection.doc(priority.id.toString());
    const existing = await docRef.get();
    
    if (existing.exists) {
      console.log(`⚠️  Priority ${priority.name} (${priority.id}) already exists, updating...`);
      batch.set(docRef, {
        ...priority,
        updatedAt: Date.now(),
      }, { merge: true });
    } else {
      console.log(`✅ Adding priority: ${priority.name}`);
      batch.set(docRef, {
        ...priority,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  
  // Seed ticket channels
  const channelCollection = db.collection('ticket_channels');
  for (const channel of ticketChannels) {
    const docRef = channelCollection.doc(channel.id);
    const existing = await docRef.get();
    
    if (existing.exists) {
      console.log(`⚠️  Channel ${channel.name} (${channel.id}) already exists, updating...`);
      batch.set(docRef, {
        ...channel,
        updatedAt: Date.now(),
      }, { merge: true });
    } else {
      console.log(`✅ Adding channel: ${channel.name}`);
      batch.set(docRef, {
        ...channel,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  
  await batch.commit();
  console.log('\n✅ Ticket types seeding completed successfully!');
  
  // Print summary
  console.log(`\n📊 Summary:`);
  console.log(`   - Complaint Types: ${complaintTypes.length}`);
  console.log(`   - SLA Definitions: ${slaDefinitions.length}`);
  console.log(`   - Ticket Statuses: ${ticketStatuses.length}`);
  console.log(`   - Ticket Priorities: ${ticketPriorities.length}`);
  console.log(`   - Ticket Channels: ${ticketChannels.length}`);
}

seedTicketTypes()
  .then(() => {
    console.log('\n🎉 Seeding complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });