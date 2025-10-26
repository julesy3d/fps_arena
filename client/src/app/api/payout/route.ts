
import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

export async function POST(req: NextRequest) {
  const roundId = `round_${Date.now()}`;
  let signature = null;

  const { SOLANA_RPC_URL, TREASURY_PRIVATE_KEY, GAME_SERVER_URL, INTERNAL_API_SECRET } = process.env;

  if (!SOLANA_RPC_URL || !TREASURY_PRIVATE_KEY || !GAME_SERVER_URL || !INTERNAL_API_SECRET) {
    console.error("Missing required environment variables");
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const authorization = req.headers.get('authorization');
    if (authorization !== `Bearer ${INTERNAL_API_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { winnerAddress, amount } = await req.json();

    if (!winnerAddress || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const privateKeyBytes = bs58.decode(TREASURY_PRIVATE_KEY);
    const treasuryKeypair = Keypair.fromSecretKey(privateKeyBytes);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasuryKeypair.publicKey,
        toPubkey: new PublicKey(winnerAddress),
        lamports: amount,
      })
    );

    signature = await sendAndConfirmTransaction(connection, transaction, [treasuryKeypair]);

    await fetch(`${GAME_SERVER_URL}/internal/log-transaction`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({
            transactionData: {
                round_id: roundId,
                transaction_type: 'payout',
                recipient_wallet: winnerAddress,
                amount: amount,
                status: 'confirmed',
                signature: signature,
                confirmed_at: new Date()
            }
        }),
    });

    return NextResponse.json({ success: true, signature });
  } catch (error) {
    console.error('Payout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    await fetch(`${GAME_SERVER_URL}/internal/log-transaction`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({
            transactionData: {
                round_id: roundId,
                status: 'failed',
                error_message: errorMessage
            }
        }),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
