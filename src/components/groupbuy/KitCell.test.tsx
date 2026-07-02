import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KitCell } from './KitCell';

describe('KitCell', () => {
  it('pluralizes the vial subtext for counts other than one', () => {
    render(<KitCell vials={20} />);
    expect(screen.getByText('20 vials')).toBeInTheDocument();
  });

  it('uses the singular "vial" for exactly one vial', () => {
    render(<KitCell vials={1} />);
    expect(screen.getByText('1 vial')).toBeInTheDocument();
  });

  it('uses the plural "vials" for zero vials', () => {
    render(<KitCell vials={0} />);
    expect(screen.getByText('0 vials')).toBeInTheDocument();
  });
});
