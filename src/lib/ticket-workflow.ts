import { Ticket, TicketStatus, TicketRole } from './sales-types';

export interface WorkflowAction {
  action: string;
  label: string;
  targetStatus: TicketStatus;
  allowedRoles: TicketRole[];
}

export const ticketWorkflow: { state: TicketStatus; role: TicketRole; actions: WorkflowAction[] }[] = [
  {
    state: 'open',
    role: 'Front-end Support',
    actions: [{ action: 'assign', label: 'Assign', targetStatus: 'assigned', allowedRoles: ['Front-end Support', 'Back-end Support'] }],
  },
  {
    state: 'open',
    role: 'Back-end Support',
    actions: [{ action: 'assign', label: 'Assign', targetStatus: 'assigned', allowedRoles: ['Back-end Support'] }],
  },
  {
    state: 'assigned',
    role: 'Back-end Support',
    actions: [
      { action: 'start', label: 'Start Work', targetStatus: 'in_progress', allowedRoles: ['Back-end Support', 'Technical'] },
      { action: 'escalate', label: 'Escalate', targetStatus: 'assigned', allowedRoles: ['Back-end Support'] },
    ],
  },
  {
    state: 'assigned',
    role: 'Technical',
    actions: [{ action: 'start', label: 'Start Work', targetStatus: 'in_progress', allowedRoles: ['Technical'] }],
  },
  {
    state: 'in_progress',
    role: 'Back-end Support',
    actions: [{ action: 'resolve', label: 'Resolve', targetStatus: 'resolved', allowedRoles: ['Back-end Support', 'Technical'] }],
  },
  {
    state: 'in_progress',
    role: 'Technical',
    actions: [{ action: 'resolve', label: 'Resolve', targetStatus: 'resolved', allowedRoles: ['Technical'] }],
  },
  {
    state: 'resolved',
    role: 'Front-end Support',
    actions: [{ action: 'close', label: 'Close', targetStatus: 'closed', allowedRoles: ['Front-end Support', 'Back-end Support'] }],
  },
];

export function calculateSLABreached(createdAt: number, assignedAt?: number): boolean {
  if (!assignedAt) return true;
  return assignedAt - createdAt > 60000; // 1 minute = 60,000ms
}

export function getNextAvailableActions(ticket: Ticket, currentUserRole: TicketRole): WorkflowAction[] {
  const workflow = ticketWorkflow.find((w) => w.state === ticket.status && w.role === currentUserRole);
  return workflow?.actions || [];
}

export function canAssignTicket(ticket: Ticket, assignerRole: TicketRole): boolean {
  return ticket.status === 'open' && !ticket.assignedTo && (assignerRole === 'Front-end Support' || assignerRole === 'Back-end Support');
}

export function canEscalateTicket(ticket: Ticket, escalatorRole: TicketRole): boolean {
  return ticket.status === 'assigned' && !!ticket.assignedTo && escalatorRole === 'Back-end Support' && !ticket.escalatedTo;
}

export function canResolveTicket(ticket: Ticket, resolverRole: TicketRole): boolean {
  return ticket.status === 'in_progress' && (resolverRole === 'Back-end Support' || resolverRole === 'Technical');
}
