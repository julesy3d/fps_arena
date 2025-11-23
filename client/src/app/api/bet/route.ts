import { verifyBetTransaction } from '@/lib/solanaAdmin';
import { checkSignatureExists } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { txSignature, amount, socketId, walletAddress } = body;

        // Validate inputs
        if (!txSignature || typeof txSignature !== 'string') {
            return Response.json({ error: 'Invalid transaction signature' }, { status: 400 });
        }

        // REPLAY PROTECTION (Optimization)
        // Check if signature is already used before verifying on-chain
        const isReplay = await checkSignatureExists(txSignature);
        if (isReplay) {
            console.warn(`[BET API] Replay attempt blocked: ${txSignature}`);
            return Response.json({ error: 'Transaction signature already used' }, { status: 400 });
        }

        // Amount is in WHOLE TOKENS (integers only)
        if (!amount || !Number.isInteger(amount) || amount < 1000) {
            return Response.json(
                { error: 'Invalid amount (must be integer >= 1000 tokens)' },
                { status: 400 }
            );
        }

        if (!walletAddress || typeof walletAddress !== 'string') {
            return Response.json({ error: 'Invalid wallet address' }, { status: 400 });
        }

        if (!socketId || typeof socketId !== 'string') {
            return Response.json({ error: 'Invalid socket ID' }, { status: 400 });
        }

        console.log(`[BET API] Verifying bet: ${amount} tokens from ${walletAddress}`);

        // Verify on blockchain (amount is in tokens)
        const verification = await verifyBetTransaction(
            txSignature,
            amount, // ← Whole tokens (e.g., 1000)
            walletAddress
        );

        if (!verification.valid) {
            console.error('[BET API] Verification failed:', verification.message);
            return Response.json({ error: verification.message }, { status: 400 });
        }

        console.log('[BET API] ✓ Bet verified:', {
            amount: verification.verifiedAmountInTokens, // ← Whole tokens
            sender: verification.verifiedSender,
            signature: txSignature
        });

        // Forward to game server (amount in tokens)
        const gameServerUrl = process.env.GAME_SERVER_URL;
        const internalSecret = process.env.INTERNAL_API_SECRET;

        if (!gameServerUrl || !internalSecret) {
            throw new Error('Game server configuration missing');
        }

        const gameServerResponse = await fetch(`${gameServerUrl}/internal/confirm-bet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${internalSecret}`,
            },
            body: JSON.stringify({
                socketId,
                walletAddress,
                amount: verification.verifiedAmountInTokens, // ← Whole tokens
                txSignature,
            }),
        });

        if (!gameServerResponse.ok) {
            const errorText = await gameServerResponse.text();
            throw new Error(`Game server rejected bet: ${errorText}`);
        }

        return Response.json({
            success: true,
            verifiedAmount: verification.verifiedAmountInTokens // ← Whole tokens
        });

    } catch (error) {
        console.error('[BET API] Error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
