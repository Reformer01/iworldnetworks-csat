import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FinanceKpiCards } from '../FinanceKpiCards';

describe('FinanceKpiCards', () => {
  it('renders collected revenue and success rate', () => {
    render(
      <FinanceKpiCards
        kpis={{ collectedNaira: 43500, successCount: 12, successRate: 92.3, unmatchedNaira: 1000, refundedNaira: 0, disputeCount: 1 }}
      />,
    );
    expect(screen.getByText('₦43,500')).toBeInTheDocument();
    expect(screen.getByText('92.3%')).toBeInTheDocument();
  });
});
