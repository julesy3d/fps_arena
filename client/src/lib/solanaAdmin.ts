/**
 * ═══════════════════════════════════════════════════════════════
 * SOLANA ADMIN - SERVER SIDE ONLY
 * ═══════════════════════════════════════════════════════════════
 *
 * This file contains sensitive admin logic and private keys.
 * NEVER IMPORT THIS FILE IN CLIENT COMPONENTS.
 */

import {
    Transaction,
    Keypair,
    PublicKey,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createTransferInstruction,
} from '@solana/spl-token';
import {
    getConnection,
    getShotMintAddress,
    getTreasuryAddress,
    tokensToBaseUnits,
    baseUnitsToTokens,
    getOrCreateAtaInstruction,
} from './solanaClient';

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
        await getAssociatedTokenAddress(
            getShotMintAddress(),
            getTreasuryAddress(),
            false,
            TOKEN_PROGRAM_ID
        );

        // Fetch transaction from blockchain
        const tx = await getConnection().getTransaction(txSignature, {
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
        const treasuryAddress = getTreasuryAddress().toBase58();
        const mintAddress = getShotMintAddress().toBase58();

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

    const privateKeyBytes = bs58.decode(privateKeyString);
    const treasuryKeypair = Keypair.fromSecretKey(privateKeyBytes);

    // Calculate token account addresses
    const winnerPubkey = new PublicKey(winnerWalletAddress);

    const treasuryAta = await getAssociatedTokenAddress(
        getShotMintAddress(),
        treasuryKeypair.publicKey,
        false,
        TOKEN_PROGRAM_ID
    );

    const winnerAta = await getAssociatedTokenAddress(
        getShotMintAddress(),
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
        getShotMintAddress()
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
    const { blockhash } = await getConnection().getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = treasuryKeypair.publicKey;

    // Sign and send
    transaction.sign(treasuryKeypair);

    const signature = await getConnection().sendRawTransaction(
        transaction.serialize(),
        {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        }
    );

    await getConnection().confirmTransaction(signature, 'confirmed');

    console.log(`[PAYOUT] ✓ Sent ${amountInTokens} tokens (signature: ${signature})`);

    return signature;
}
