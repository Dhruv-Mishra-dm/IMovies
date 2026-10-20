import { randomUUID } from 'node:crypto';

/**
 * DEMO payment provider — moves no money and never sees card details.
 *
 * It implements the same four operations a real gateway (Razorpay, Stripe, …) offers, so a real
 * provider can replace it by implementing this interface:
 *   authorize({ amount, currency, reference, outcome }) → { approved, authorizationId?, failureCode?, failureMessage? }
 *   capture({ authorizationId, amount })                → { captureId }
 *   void({ authorizationId })                           → {}
 *   refund({ captureId, amount })                       → { refundId }
 *
 * The customer chooses the outcome explicitly on the demo payment screen ("approve" or a decline
 * reason), which makes every path testable. A real integration would instead redirect to the
 * provider's hosted page, and the server would learn the result from a signature-verified webhook —
 * never from the browser.
 */
export const DEMO_OUTCOMES = Object.freeze({
  SUCCESS: 'SUCCESS',
  DECLINED: 'DECLINED',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
});

const FAILURES = {
  DECLINED: { failureCode: 'CARD_DECLINED', failureMessage: 'The demo payment was declined. You can try again.' },
  INSUFFICIENT_FUNDS: { failureCode: 'INSUFFICIENT_FUNDS', failureMessage: 'The demo payment failed: insufficient funds. You can try again.' },
};

export const simulatedProvider = {
  name: 'SIMULATED',

  async authorize({ outcome }) {
    if (outcome === DEMO_OUTCOMES.SUCCESS) return { approved: true, authorizationId: `sim_auth_${randomUUID()}` };
    return { approved: false, ...(FAILURES[outcome] ?? FAILURES.DECLINED) };
  },

  async capture() {
    return { captureId: `sim_cap_${randomUUID()}` };
  },

  async void() {
    return {};
  },

  async refund() {
    return { refundId: `sim_ref_${randomUUID()}` };
  },
};

let activeProvider = simulatedProvider;

/** The provider in use. Tests swap it to simulate slow or failing gateways. */
export const paymentProvider = () => activeProvider;

export function setPaymentProvider(provider) {
  activeProvider = provider;
}

export function resetPaymentProvider() {
  activeProvider = simulatedProvider;
}
