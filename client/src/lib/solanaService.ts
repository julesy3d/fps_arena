/**
* ═══════════════════════════════════════════════════════════════
* SOLANA SERVICE - TOKEN CONVERSION BOUNDARY
* ═══════════════════════════════════════════════════════════════
*
* This file is the ONLY place where conversion between whole tokens
* and blockchain base units occurs.
*
* INPUTS: Whole tokens (e.g., 1000)
* OUTPUTS: Whole tokens (e.g., 1000)
* INTERNAL: Converts to/from base units for blockchain operations
*
* ═══════════════════════════════════════════════════════════════
*/

import {
Connection,
PublicKey,
Transaction,
TransactionInstruction
} from '@solana/web3.js';
import {
TOKEN_PROGRAM_ID,
getAssociatedTokenAddress,
createAssociatedTokenAccountInstruction,
createTransferInstruction,
} from '@solana/spl-token';

// ============================================
// CONFIGURATION
// ============================================

const RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
if (!RPC_URL) throw new Error('SOLANA_RPC_URL not configured');

const SHOT_MINT_ADDRESS = new PublicKey(
process.env.SHOT_MINT_ADDRESS || process.env.NEXT_PUBLIC_SHOT_MINT_ADDRESS!
);

const TREASURY_ADDRESS = new PublicKey(
process.env.TREASURY_WALLET_ADDRESS || process.env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS!
);

const SHOT_TOKEN_DECIMALS = parseInt(
process.env.SHOT_TOKEN_DECIMALS || process.env.NEXT_PUBLIC_SHOT_TOKEN_DECIMALS || '6'
);

export const connection = new Connection(RPC_URL, 'confirmed');

// ============================================
// CONVERSION FUNCTIONS (INTERNAL USE ONLY)
// ============================================

/**
* ★ CONVERSION LAYER ★
*
* Converts whole tokens to blockchain base units
*
* Example with 6 decimals:
* Input: 1000 (tokens)
* Output: 1000000000n (base units)
*
* Formula: tokens × (10 ^ decimals)
*
* @internal - Do not export, only for use within this file
*/
function tokensToBaseUnits(amountInTokens: number): bigint {
if (!Number.isInteger(amountInTokens)) {
throw new Error(`Amount must be an integer, got: ${amountInTokens}`);
}

if (amountInTokens < 0) {
throw new Error(`Amount must be non-negative, got: ${amountInTokens}`);
}

// Calculate: tokens × (10^decimals)
const multiplier = BigInt(10 ** SHOT_TOKEN_DECIMALS);
const baseUnits = BigInt(amountInTokens) * multiplier;

console.log(`[CONVERSION] ${amountInTokens} tokens → ${baseUnits} base units`);

return baseUnits;
}

/**
* ★ CONVERSION LAYER ★
*
* Converts blockchain base units to whole tokens
*
* Example with 6 decimals:
* Input: 1000000000n (base units)
* Output: 1000 (tokens)
*
* Formula: base_units ÷ (10 ^ decimals)
*
* @internal - Do not export, only for use within this file
*/
function baseUnitsToTokens(baseUnits: bigint | string): number {
const units = typeof baseUnits === 'string' ? BigInt(baseUnits) : baseUnits;

// Calculate: base_units ÷ (10^decimals)
const divisor = BigInt(10 ** SHOT_TOKEN_DECIMALS);
const tokens = Number(units / divisor);

console.log(`[CONVERSION] ${units} base units → ${tokens} tokens`);

return tokens;
}

// ============================================
// ATA MANAGEMENT
// ============================================

async function getOrCreateAtaInstruction(
payer: PublicKey,
owner: PublicKey,
mint: PublicKey
): Promise<TransactionInstruction | null> {
const ata = await getAssociatedTokenAddress(
mint,
owner,
false,
TOKEN_PROGRAM_ID
);

const accountInfo = await connection.getAccountInfo(ata);

if (accountInfo) {
return null;
}

return createAssociatedTokenAccountInstruction(
payer,
ata,
owner,
mint,
TOKEN_PROGRAM_ID
);
}

// ============================================
// CLIENT-SIDE: TRANSACTION CREATION
// ============================================

/**
* Creates an unsigned SPL token transfer transaction
*
* @param senderPubkey - User's wallet public key
* @param amountInTokens - Amount in WHOLE TOKENS (e.g., 1000)
* @returns Unsigned transaction ready for wallet signing
*
* Example:
* Input: amountInTokens = 1000
* Creates instruction to transfer 1,000,000,000 base units
*/
export async function createShotTransferTransaction(
senderPubkey: PublicKey,
amountInTokens: number
): Promise<Transaction> {
console.log(`[CREATE TX] Creating transaction for ${amountInTokens} tokens`);

// ★ CONVERSION: tokens → base units
const baseUnits = tokensToBaseUnits(amountInTokens);

// Calculate token account addresses
const senderAta = await getAssociatedTokenAddress(
SHOT_MINT_ADDRESS,
senderPubkey,
false,
TOKEN_PROGRAM_ID
);

const treasuryAta = await getAssociatedTokenAddress(
SHOT_MINT_ADDRESS,
TREASURY_ADDRESS,
false,
TOKEN_PROGRAM_ID
);

// Verify sender has token account
const senderAtaInfo = await connection.getAccountInfo(senderAta);
if (!senderAtaInfo) {
throw new Error(
'You do not have a $SHOT token account. Please obtain $SHOT tokens first.'
);
}

// Build transaction
const transaction = new Transaction();

// Add transfer instruction (uses BASE UNITS)
transaction.add(
createTransferInstruction(
senderAta,
treasuryAta,
senderPubkey,
baseUnits, // ← Blockchain sees base units
[],
TOKEN_PROGRAM_ID
)
);

console.log(`[CREATE TX] Transaction created with ${baseUnits} base units`);

return transaction;
}

// ============================================
// SERVER-SIDE: TRANSACTION VERIFICATION
// ============================================

/**
* Verifies that a bet transaction transferred the correct amount
*
* @param txSignature - Transaction signature to verify
* @param expectedAmountInTokens - Expected amount in WHOLE TOKENS (e.g., 1000)
* @param expectedSender - Expected sender wallet address
* @returns Verification result with amount in WHOLE TOKENS
*
* Example:
* Input: expectedAmountInTokens = 1000
* Checks blockchain received 1,000,000,000 base units
* Output: verifiedAmountInTokens = 1000
*/
export async function verifyBetTransaction(
txSignature: string,
expectedAmountInTokens: number,
expectedSender: string
): Promise<{
valid: boolean;
message: string;
verifiedAmountInTokens?: number;
verifiedSender?: string;
}> {
try {
console.log(`[VERIFY] Verifying transaction for ${expectedAmountInTokens} tokens`);

// ★ CONVERSION: tokens → base units for comparison
const expectedBaseUnits = tokensToBaseUnits(expectedAmountInTokens);

// Calculate treasury token account
const treasuryAta = await getAssociatedTokenAddress(
SHOT_MINT_ADDRESS,
TREASURY_ADDRESS,
false,
TOKEN_PROGRAM_ID
);

// Fetch transaction from blockchain
const tx = await connection.getTransaction(txSignature, {
maxSupportedTransactionVersion: 0,
});

if (!tx) {
return { valid: false, message: 'Transaction not found' };
}

if (tx.meta?.err) {
return {
valid: false,
message: `Transaction failed: ${JSON.stringify(tx.meta.err)}`
};
}

// Verify sender
const signer = tx.transaction.message.staticAccountKeys[0];
if (signer.toBase58() !== expectedSender) {
return {
valid: false,
message: `Sender mismatch: expected ${expectedSender}, got ${signer.toBase58()}`,
};
}

// Parse token balance changes
const { preTokenBalances, postTokenBalances } = tx.meta!;

if (!preTokenBalances || !postTokenBalances) {
return { valid: false, message: 'No token balance data in transaction' };
}

// Find treasury's balance change
const treasuryAddress = TREASURY_ADDRESS.toBase58();
const mintAddress = SHOT_MINT_ADDRESS.toBase58();

const preBalance = preTokenBalances.find(
(b) => b.owner === treasuryAddress && b.mint === mintAddress
);

const postBalance = postTokenBalances.find(
(b) => b.owner === treasuryAddress && b.mint === mintAddress
);

if (!postBalance) {
return { valid: false, message: 'Treasury did not receive tokens' };
}

// Calculate received amount (in base units from blockchain)
const preAmount = preBalance?.uiTokenAmount?.amount || '0';
const postAmount = postBalance.uiTokenAmount.amount;
const receivedBaseUnits = BigInt(postAmount) - BigInt(preAmount);

console.log(`[VERIFY] Blockchain received ${receivedBaseUnits} base units`);

// Verify amount matches expectation
if (receivedBaseUnits !== expectedBaseUnits) {
// ★ CONVERSION: base units → tokens for error message
const receivedTokens = baseUnitsToTokens(receivedBaseUnits);
return {
valid: false,
message: `Amount mismatch: expected ${expectedAmountInTokens} tokens, received ${receivedTokens} tokens`,
};
}

// ★ CONVERSION: base units → tokens for return value
const verifiedTokens = baseUnitsToTokens(receivedBaseUnits);

console.log(`[VERIFY] ✓ Verified ${verifiedTokens} tokens`);

return {
valid: true,
message: 'Transaction verified successfully',
verifiedAmountInTokens: verifiedTokens, // ← Returns whole tokens
verifiedSender: signer.toBase58(),
};

} catch (error) {
console.error('[VERIFY] Error:', error);
return {
valid: false,
message: error instanceof Error ? error.message : 'Unknown verification error',
};
}
}

// ============================================
// SERVER-SIDE: PAYOUT EXECUTION
// ============================================

/**
* Sends $SHOT tokens from treasury to winner
*
* @param winnerWalletAddress - Winner's wallet address
* @param amountInTokens - Amount in WHOLE TOKENS (e.g., 1000)
* @returns Transaction signature
*
* Example:
* Input: amountInTokens = 1000
* Sends 1,000,000,000 base units on blockchain
*/
export async function sendShotTokens(
winnerWalletAddress: string,
amountInTokens: number
): Promise<string> {
console.log(`[PAYOUT] Sending ${amountInTokens} tokens to ${winnerWalletAddress}`);

// ★ CONVERSION: tokens → base units
const baseUnits = tokensToBaseUnits(amountInTokens);

// Load treasury keypair (server-side only)
const privateKeyString = process.env.TREASURY_PRIVATE_KEY;
if (!privateKeyString) {
throw new Error('TREASURY_PRIVATE_KEY not configured');
}

const { Keypair } = await import('@solana/web3.js');
const bs58 = (await import('bs58')).default;
const privateKeyBytes = bs58.decode(privateKeyString);
const treasuryKeypair = Keypair.fromSecretKey(privateKeyBytes);

// Calculate token account addresses
const winnerPubkey = new PublicKey(winnerWalletAddress);

const treasuryAta = await getAssociatedTokenAddress(
SHOT_MINT_ADDRESS,
treasuryKeypair.publicKey,
false,
TOKEN_PROGRAM_ID
);

const winnerAta = await getAssociatedTokenAddress(
SHOT_MINT_ADDRESS,
winnerPubkey,
false,
TOKEN_PROGRAM_ID
);

// Build transaction
const transaction = new Transaction();

// Create winner's token account if needed
const createAtaIx = await getOrCreateAtaInstruction(
treasuryKeypair.publicKey,
winnerPubkey,
SHOT_MINT_ADDRESS
);

if (createAtaIx) {
console.log('[PAYOUT] Creating winner ATA');
transaction.add(createAtaIx);
}

// Add transfer instruction (uses BASE UNITS)
transaction.add(
createTransferInstruction(
treasuryAta,
winnerAta,
treasuryKeypair.publicKey,
baseUnits, // ← Blockchain sees base units
[],
TOKEN_PROGRAM_ID
)
);

console.log(`[PAYOUT] Transaction created with ${baseUnits} base units`);

// Set blockhash and fee payer
const { blockhash } = await connection.getLatestBlockhash('confirmed');
transaction.recentBlockhash = blockhash;
transaction.feePayer = treasuryKeypair.publicKey;

// Sign and send
transaction.sign(treasuryKeypair);

const signature = await connection.sendRawTransaction(
transaction.serialize(),
{
skipPreflight: false,
preflightCommitment: 'confirmed',
}
);

await connection.confirmTransaction(signature, 'confirmed');

console.log(`[PAYOUT] ✓ Sent ${amountInTokens} tokens (signature: ${signature})`);

return signature;
}
