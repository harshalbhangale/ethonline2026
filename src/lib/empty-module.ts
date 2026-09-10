/**
 * Stub for optional peer dependencies we deliberately do not install.
 *
 * Privy's wallet stack lists `@farcaster/mini-app-solana` as an optional peer.
 * We do not use Solana, so bundlers are pointed here instead of warning about a
 * missing module. Webpack can alias such a request to `false`; Turbopack only
 * accepts a module path, which is why this file exists.
 */
const emptyModule = {};

export default emptyModule;
