# Server Changes

## [UNRELEASED]

### Fixed
- **Bug #1: Undefined `TREASURY_KEYPAIR`**: Replaced `TREASURY_KEYPAIR.publicKey.toBase58()` with `TREASURY_WALLET_ADDRESS` from environment variables to fix undefined errors in `endRound()`.
- **Bug #2: Undefined `payoutSignature`**: The `fetch` call to the payout API is now properly handled. The response is consumed, and `payoutSignature` is defined before being used.
- **Bug #3: Rate Limiting Not Enforced**: Implemented rate limiting for the `player:requestChallenge` socket event to prevent abuse.

### Changed
- **DRY Refactoring**: Extracted duplicated payout logic into a new helper function `handlePayout` to improve code maintainability.