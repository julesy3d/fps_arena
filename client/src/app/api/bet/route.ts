
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Helper function to verify the signature
function verifyWalletSignature(walletAddress: string, signature: string, message: string) {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = new PublicKey(walletAddress).toBytes();
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const { SOLANA_RPC_URL, TREASURY_WALLET_ADDRESS, GAME_SERVER_URL, INTERNAL_API_SECRET } = process.env;

  if (!SOLANA_RPC_URL || !TREASURY_WALLET_ADDRESS || !GAME_SERVER_URL || !INTERNAL_API_SECRET) {
    console.error("Missing required environment variables");
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const { txSignature, signedMessage, amount, socketId, walletAddress } = await req.json();

    if (!txSignature || !signedMessage || !amount || !socketId || !walletAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Verify the signature
    const isValidSignature = verifyWalletSignature(walletAddress, signedMessage.signature, signedMessage.message);
    if (!isValidSignature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 2. Verify the transaction
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const tx = await connection.getTransaction(txSignature, { maxSupportedTransactionVersion: 0 });

    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    if (!("instructions" in tx.transaction.message)) {
        return NextResponse.json({ error: 'Unsupported transaction version' }, { status: 400 });
    }
    const message = tx.transaction.message;

    const transferInstruction = message.instructions.find(
      (instruction) =>
        message.accountKeys[instruction.programIdIndex].toBase58() === SystemProgram.programId.toBase58()
    );

    if (!transferInstruction) {
      return NextResponse.json({ error: 'No transfer instruction found' }, { status: 400 });
    }

    const instructionData = Buffer.from(bs58.decode(transferInstruction.data));
    const instructionType = instructionData.readUInt32LE(0);
    if (instructionType !== 2) {
        throw new Error("Not a transfer instruction");
    }
    const lamports = Number(instructionData.readBigUInt64LE(4));

    const from = message.accountKeys[transferInstruction.accounts[0]].toBase58();
    const to = message.accountKeys[transferInstruction.accounts[1]].toBase58();

    if (
        from !== walletAddress ||
        to !== TREASURY_WALLET_ADDRESS ||
        lamports !== amount
    ) {
      return NextResponse.json({ error: 'Transaction details are incorrect' }, { status: 400 });
    }


    // 3. Confirm bet with the game server
    const response = await fetch(`${GAME_SERVER_URL}/internal/confirm-bet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTERNAL_API_SECRET}`,
      },
      body: JSON.stringify({ socketId, amount, walletAddress }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({ error: 'Failed to confirm bet with game server', details: errorData }, { status: response.status });
    }

    return NextResponse.json({ success: true, message: 'Bet verified and confirmed' });
  } catch (error) {
    console.error('Bet verification error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal server error', details: errorMessage }, { status: 500 });
  }
}
