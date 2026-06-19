import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminLogin from './AdminLogin';

describe('AdminLogin', () => {
  it('submits the entered email and password', async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn().mockResolvedValue({ success: true });

    render(<AdminLogin onSignIn={onSignIn} error={null} />);

    await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/password/i), 's3cret');
    await user.click(screen.getByRole('button', { name: /access dashboard/i }));

    await waitFor(() => {
      expect(onSignIn).toHaveBeenCalledWith('admin@example.com', 's3cret');
    });
  });

  it('surfaces the auth error to the user', () => {
    render(<AdminLogin onSignIn={vi.fn()} error="Invalid email or password." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('requires both email and password', () => {
    render(<AdminLogin onSignIn={vi.fn()} error={null} />);

    expect(screen.getByLabelText(/email/i)).toBeRequired();
    expect(screen.getByLabelText(/password/i)).toBeRequired();
  });
});
