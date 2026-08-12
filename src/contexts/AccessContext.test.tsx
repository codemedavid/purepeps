import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccessProvider, useAccessContext } from './AccessContext';

const access = { isVerified: true, email: 'member@example.com' };
const mockUseAccess = vi.fn(() => access);
vi.mock('../hooks/useAccess', () => ({ useAccess: () => mockUseAccess() }));

function Consumer({ label }: { label: string }) {
  const value = useAccessContext();
  return <span>{label}:{value.isVerified ? 'member' : 'visitor'}</span>;
}

describe('AccessProvider', () => {
  it('shares one access resolution across all public consumers', () => {
    render(
      <AccessProvider>
        <Consumer label="one" />
        <Consumer label="two" />
      </AccessProvider>,
    );

    expect(screen.getByText('one:member')).toBeInTheDocument();
    expect(screen.getByText('two:member')).toBeInTheDocument();
    expect(mockUseAccess).toHaveBeenCalledTimes(1);
  });
});
