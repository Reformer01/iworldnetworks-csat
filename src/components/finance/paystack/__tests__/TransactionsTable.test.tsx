import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TransactionsTable } from '../TransactionsTable';

describe('TransactionsTable', () => {
  it('renders reference, customer, amount, channel, payment and reconciliation status, and variance', () => {
    render(
      <TransactionsTable
        rows={[
          {
            reference: 'PSK-123',
            customer: 'Adaeze Obi',
            customerEmail: 'ada@example.com',
            amountNaira: 43500,
            channel: 'card',
            status: 'success',
            reconStatus: 'matched',
            varianceNaira: 0,
            paidAt: '2026-08-01T10:00:00.000Z',
          },
          {
            reference: 'PSK-124',
            customer: 'Bola Ade',
            customerEmail: 'bola@example.com',
            amountNaira: 12000,
            channel: 'bank_transfer',
            status: 'success',
            reconStatus: 'amount-mismatch',
            varianceNaira: 500,
            paidAt: '2026-08-02T10:00:00.000Z',
          },
        ]}
      />,
    );
    expect(screen.getByText('PSK-123')).toBeInTheDocument();
    expect(screen.getByText('Adaeze Obi')).toBeInTheDocument();
    expect(screen.getByText('₦43,500')).toBeInTheDocument();
    expect(screen.getByText('card')).toBeInTheDocument();
    expect(screen.getAllByText('success').length).toBeGreaterThan(0);
    expect(screen.getByText('matched')).toBeInTheDocument();
    expect(screen.getByText('amount-mismatch')).toBeInTheDocument();
    expect(screen.getByText('₦500')).toBeInTheDocument();
  });

  it('renders an empty state when there are no rows', () => {
    render(<TransactionsTable rows={[]} />);
    expect(screen.getByText(/no transactions/i)).toBeInTheDocument();
  });
});
