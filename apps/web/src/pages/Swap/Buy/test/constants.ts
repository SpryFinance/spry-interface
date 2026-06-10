// SPRY: the buy fiat-on-ramp page was pruned; only the shared provider-connection views
// (used by ReceiveCryptoModal) remain in this folder. Their tests need just this fixture.
export const mockServiceProvider = {
  serviceProvider: 'test-provider',
  name: 'Test Provider',
  url: 'test.provider',
  logos: {
    darkLogo: 'test-provider-logo-dark',
    lightLogo: 'test-provider-logo-light',
  },
  paymentMethods: ['Credit Card'],
}
