
import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

export async function POST(req) {
  const roundId = `round_${Date.now()}`;
  let signature = null;

  try {
    const authorization = req.headers.get('authorization');
    if (authorization !== `Bearer ${process.env.INTERNAL_API_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { winnerAddress, amount } = await req.json();

    if (!winnerAddress || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
    const privateKeyBytes = bs58.decode(process.env.TREASURY_PRIVATE_KEY);
    const treasuryKeypair = Keypair.fromSecretKey(privateKeyBytes);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasuryKeypair.publicKey,
        toPubkey: new PublicKey(winnerAddress),
        lamports: amount,
      })
    );

    signature = await sendAndConfirmTransaction(connection, transaction, [treasuryKeypair]);

    await fetch(`${process.env.GAME_SERVER_URL}/internal/log-transaction`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}`,
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
    await fetch(`${process.env.GAME_SERVER_URL}/internal/log-transaction`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({
            transactionData: {
                round_id: roundId,
                status: 'failed',
                error_message: error.message
            }
        }),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
