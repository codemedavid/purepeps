import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GroupBuyLanding from './GroupBuyLanding';
import { DEFAULT_GB_LANDING, type GbLandingContent } from '../../utils/gbLanding';

const content = (overrides: Partial<GbLandingContent> = {}): GbLandingContent => ({
  ...DEFAULT_GB_LANDING,
  ...overrides,
});

const withStages = (overrides: Partial<GbLandingContent> = {}): GbLandingContent =>
  content({
    stages: [
      { ...DEFAULT_GB_LANDING.stages[0], title: 'GB Open', date: 'Sep 05', time: '9:00 AM' },
      { ...DEFAULT_GB_LANDING.stages[1], title: 'Order Cut-off', date: 'Sep 19', time: '5:00 PM' },
      { ...DEFAULT_GB_LANDING.stages[2], title: 'Order Submission', date: 'Sep 20', time: 'Same day' },
      {
        ...DEFAULT_GB_LANDING.stages[3],
        title: 'ETA / Shipping',
        date: 'Oct 10 - 18',
        time: 'Estimated',
      },
    ],
    ...overrides,
  });

const renderLanding = (
  overrides: Partial<GbLandingContent> = {},
  { isBatchOpen = true }: { isBatchOpen?: boolean } = {},
) => {
  const onAction = vi.fn();
  render(
    <GroupBuyLanding
      content={withStages(overrides)}
      isBatchOpen={isBatchOpen}
      onAction={onAction}
    />,
  );
  return { onAction };
};

describe('GroupBuyLanding — status badge', () => {
  it('shows the admin status text with the live batch state in auto mode', () => {
    renderLanding({ statusMode: 'auto', statusText: 'Group Buy' }, { isBatchOpen: true });

    expect(screen.getByTestId('gb-status-badge')).toHaveTextContent(/Group Buy.*OPEN/i);
  });

  it('reads closed from the live batch in auto mode', () => {
    renderLanding({ statusMode: 'auto', statusText: 'Group Buy' }, { isBatchOpen: false });

    expect(screen.getByTestId('gb-status-badge')).toHaveTextContent(/Group Buy.*CLOSED/i);
  });

  it('lets an explicit admin status override the live batch', () => {
    renderLanding({ statusMode: 'closed' }, { isBatchOpen: true });

    expect(screen.getByTestId('gb-status-badge')).toHaveTextContent(/CLOSED/i);
  });
});

describe('GroupBuyLanding — editable copy', () => {
  it('renders the headline and its highlighted tail in one heading', () => {
    renderLanding({ headline: 'Batch 12 is live,', headlineHighlight: 'join before Friday.' });

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Batch 12 is live,');
    expect(heading).toHaveTextContent('join before Friday.');
  });

  it('omits the highlight when the admin blanks it', () => {
    renderLanding({ headline: 'Just the headline', headlineHighlight: '' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Just the headline');
    expect(screen.queryByTestId('gb-headline-highlight')).not.toBeInTheDocument();
  });

  it('renders the description and the bottom supporting note', () => {
    renderLanding({
      description: 'Pool your order with the group.',
      bottomNote: 'The more members join, the lower the price!',
    });

    expect(screen.getByText('Pool your order with the group.')).toBeInTheDocument();
    expect(screen.getByText('The more members join, the lower the price!')).toBeInTheDocument();
  });

  it('omits the bottom note when the admin blanks it', () => {
    renderLanding({ bottomNote: '' });

    expect(screen.queryByTestId('gb-bottom-note')).not.toBeInTheDocument();
  });
});

describe('GroupBuyLanding — timeline', () => {
  it('renders the admin timeline title', () => {
    renderLanding({ timelineTitle: 'GB Timeline' });

    expect(screen.getByText('GB Timeline')).toBeInTheDocument();
  });

  it('lists the four stages in order as an ordered list', () => {
    renderLanding();

    const stages = screen.getAllByRole('listitem');
    expect(stages).toHaveLength(4);
    expect(stages[0]).toHaveTextContent('GB Open');
    expect(stages[1]).toHaveTextContent('Order Cut-off');
    expect(stages[2]).toHaveTextContent('Order Submission');
    expect(stages[3]).toHaveTextContent('ETA / Shipping');
  });

  it('shows every stage title, description, date and time', () => {
    renderLanding();

    const cutOff = screen.getAllByRole('listitem')[1];
    expect(within(cutOff).getByText('Order Cut-off')).toBeInTheDocument();
    expect(within(cutOff).getByText(DEFAULT_GB_LANDING.stages[1].description)).toBeInTheDocument();
    expect(within(cutOff).getByText('Sep 19')).toBeInTheDocument();
    expect(within(cutOff).getByText('5:00 PM')).toBeInTheDocument();

    const shipping = screen.getAllByRole('listitem')[3];
    expect(within(shipping).getByText('Oct 10 - 18')).toBeInTheDocument();
    expect(within(shipping).getByText('Estimated')).toBeInTheDocument();
  });

  it('leaves out a date or time the admin has not filled in', () => {
    renderLanding({
      stages: [
        { ...DEFAULT_GB_LANDING.stages[0], date: '', time: '' },
        ...DEFAULT_GB_LANDING.stages.slice(1),
      ] as unknown as GbLandingContent['stages'],
    });

    const first = screen.getAllByRole('listitem')[0];
    expect(within(first).queryByTestId('gb-stage-date')).not.toBeInTheDocument();
    expect(within(first).queryByTestId('gb-stage-time')).not.toBeInTheDocument();
  });

  it('marks the connector as decorative so it is not announced', () => {
    renderLanding();

    expect(screen.getByTestId('gb-timeline-connector')).toHaveAttribute('aria-hidden', 'true');
  });
});

// Between buys the stage dates describe a schedule that is over, so the whole
// card is swapped for a panel saying when the next buy starts. Every word of it
// is admin-written.
describe('GroupBuyLanding — closed state', () => {
  const closed = { statusMode: 'closed' as const };

  it('replaces the timeline with the closed panel', () => {
    renderLanding(closed);

    expect(screen.getByTestId('gb-closed-panel')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.queryByText('GB Open')).not.toBeInTheDocument();
  });

  it('renders the admin closed heading, date and message', () => {
    renderLanding({
      ...closed,
      closedTitle: 'Next Group Buy',
      closedDate: 'October 15',
      closedMessage: 'Batch 13 opens after the long weekend.',
    });

    expect(screen.getByText('Next Group Buy')).toBeInTheDocument();
    expect(screen.getByTestId('gb-closed-date')).toHaveTextContent('October 15');
    expect(screen.getByText('Batch 13 opens after the long weekend.')).toBeInTheDocument();
  });

  it('omits the date line when the admin has not set one', () => {
    renderLanding({ ...closed, closedDate: '' });

    expect(screen.queryByTestId('gb-closed-date')).not.toBeInTheDocument();
    // The panel itself still renders its heading and message.
    expect(screen.getByTestId('gb-closed-panel')).toBeInTheDocument();
  });

  it('follows the live batch when the admin leaves the status on auto', () => {
    renderLanding({ statusMode: 'auto' }, { isBatchOpen: false });

    expect(screen.getByTestId('gb-closed-panel')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows the timeline, not the closed panel, while the buy is open', () => {
    renderLanding({ statusMode: 'open' }, { isBatchOpen: false });

    expect(screen.queryByTestId('gb-closed-panel')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('keeps the calls to action available while closed', () => {
    renderLanding(closed);

    expect(screen.getByTestId('gb-cta-primary')).toBeInTheDocument();
  });
});

describe('GroupBuyLanding — calls to action', () => {
  it('invokes the primary CTA action', async () => {
    const user = userEvent.setup();
    const { onAction } = renderLanding({
      primaryCtaLabel: 'Browse the Catalog',
      primaryCtaAction: 'catalog',
    });

    await user.click(screen.getByRole('button', { name: /Browse the Catalog/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('catalog');
  });

  it('invokes the secondary CTA action', async () => {
    const user = userEvent.setup();
    const { onAction } = renderLanding({
      secondaryCtaLabel: 'Get Access',
      secondaryCtaAction: 'access',
    });

    await user.click(screen.getByRole('button', { name: /Get Access/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('access');
  });

  it('hides the secondary CTA when the admin blanks its label', () => {
    renderLanding({ secondaryCtaLabel: '' });

    expect(screen.queryByTestId('gb-cta-secondary')).not.toBeInTheDocument();
    // The primary CTA is unaffected.
    expect(screen.getByTestId('gb-cta-primary')).toBeInTheDocument();
  });

  it('hides a CTA whose action is none, so a blank action cannot render a dead button', () => {
    renderLanding({ secondaryCtaLabel: 'Nowhere', secondaryCtaAction: 'none' });

    expect(screen.queryByTestId('gb-cta-secondary')).not.toBeInTheDocument();
  });
});

describe('GroupBuyLanding — structure', () => {
  it('exposes one landmark section labelled by the headline', () => {
    renderLanding({ headline: 'Research peptides,', headlineHighlight: 'priced by the crowd.' });

    expect(screen.getByRole('region', { name: /Research peptides/i })).toBeInTheDocument();
  });

  it('renders no product catalog of its own', () => {
    renderLanding();

    expect(screen.queryByRole('heading', { name: 'Catalog' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Search catalog/i)).not.toBeInTheDocument();
  });
});
