import { sendShotTokens } from '@/lib/solanaAdmin';

export async function POST(req: Request) {
    try {
        // Verify internal secret FIRST
        const authHeader = req.headers.get('authorization');
        const internalSecret = process.env.INTERNAL_API_SECRET;

        if (!authHeader || authHeader !== `Bearer ${internalSecret}`) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { walletAddress, amount } = body;

        // Validate inputs
        if (!walletAddress || typeof walletAddress !== 'string') {
            return Response.json({ error: 'Invalid wallet address' }, { status: 400 });
        }

        // Amount is in WHOLE TOKENS (integers only)
        if (!amount || !Number.isInteger(amount) || amount <= 0) {
            return Response.json(
                { error: 'Invalid amount (must be positive integer tokens)' },
                { status: 400 }
            );
        }

        console.log(`[PAYOUT API] Sending ${amount} tokens to ${walletAddress}`);

        // Send tokens (amount is in tokens)
        const signature = await sendShotTokens(
            walletAddress,
            amount // ← Whole tokens (e.g., 1000)
        );

        console.log('[PAYOUT API] ✓ Payout successful:', signature);

        return Response.json({
            success: true,
            signature,
            amount // ← Returns whole tokens
        });

    } catch (error) {
        console.error('[PAYOUT API] Error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Payout failed' },
            { status: 500 }
        );
    }
}
