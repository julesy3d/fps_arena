/**
 * ═══════════════════════════════════════════════════════════════
 * SOLANA CLIENT - PUBLIC FUNCTIONS
 * ═══════════════════════════════════════════════════════════════
 *
 * This file contains safe-to-expose functions for the client.
 * NO PRIVATE KEYS or ADMIN LOGIC should be here.
 */

import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
} from '@solana/spl-token';

// ============================================
// CONFIGURATION (LAZY INITIALIZATION)
// ============================================

let connection: Connection | null = null;
export const getConnection = () => {
    if (!connection) {
        const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
        if (!rpcUrl) throw new Error('SOLANA_RPC_URL not configured');
        connection = new Connection(rpcUrl, 'confirmed');
    }
    return connection;
};

let shotMintAddress: PublicKey | null = null;
export const getShotMintAddress = () => {
    if (!shotMintAddress) {
        const mintAddress = process.env.SHOT_MINT_ADDRESS || process.env.NEXT_PUBLIC_SHOT_MINT_ADDRESS;
        if (!mintAddress) throw new Error('SHOT_MINT_ADDRESS not configured');
        shotMintAddress = new PublicKey(mintAddress);
    }
    return shotMintAddress;
};

let treasuryAddress: PublicKey | null = null;
export const getTreasuryAddress = () => {
    if (!treasuryAddress) {
        const address = process.env.TREASURY_WALLET_ADDRESS || process.env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS;
        if (!address) throw new Error('TREASURY_WALLET_ADDRESS not configured');
        treasuryAddress = new PublicKey(address);
    }
    return treasuryAddress;
};

export const getShotTokenDecimals = () => {
    return parseInt(
        process.env.SHOT_TOKEN_DECIMALS || process.env.NEXT_PUBLIC_SHOT_TOKEN_DECIMALS || '6'
    );
};

// ============================================
// CONVERSION FUNCTIONS
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
 */
export function tokensToBaseUnits(amountInTokens: number): bigint {
    if (!Number.isInteger(amountInTokens)) {
        throw new Error(`Amount must be an integer, got: ${amountInTokens}`);
    }

    if (amountInTokens < 0) {
        throw new Error(`Amount must be non-negative, got: ${amountInTokens}`);
    }

    // Calculate: tokens × (10^decimals)
    const multiplier = BigInt(10 ** getShotTokenDecimals());
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
 */
export function baseUnitsToTokens(baseUnits: bigint | string): number {
    const units = typeof baseUnits === 'string' ? BigInt(baseUnits) : baseUnits;

    // Calculate: base_units ÷ (10^decimals)
    const divisor = BigInt(10 ** getShotTokenDecimals());
    const tokens = Number(units / divisor);

    console.log(`[CONVERSION] ${units} base units → ${tokens} tokens`);

    return tokens;
}

// ============================================
// ATA MANAGEMENT
// ============================================

export async function getOrCreateAtaInstruction(
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

    const accountInfo = await getConnection().getAccountInfo(ata);

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
        getShotMintAddress(),
        senderPubkey,
        false,
        TOKEN_PROGRAM_ID
    );

    const treasuryAta = await getAssociatedTokenAddress(
        getShotMintAddress(),
        getTreasuryAddress(),
        false,
        TOKEN_PROGRAM_ID
    );

    // Verify sender has token account
    const senderAtaInfo = await getConnection().getAccountInfo(senderAta);
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
