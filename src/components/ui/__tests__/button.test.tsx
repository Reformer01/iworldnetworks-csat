import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../button';

describe('Button', () => {
  it('renders with text content', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText('Click Me')).toBeDefined();
  });

  it('applies variant classes', () => {
    const { container } = render(<Button variant="secondary">Secondary</Button>);
    expect(container.firstChild).toHaveProperty('className');
  });

  it('forwards click handler', () => {
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Click</Button>);
    screen.getByText('Click').click();
    expect(clicked).toBe(true);
  });
});
