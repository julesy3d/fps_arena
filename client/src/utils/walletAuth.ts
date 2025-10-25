/**
 * Wallet Authentication Utility
 * Place this at: client/src/utils/walletAuth.ts
 */

import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import type { Socket } from 'socket.io-client';

/**
 * Authenticates a wallet with the server using cryptographic signatures
 * This prevents wallet address spoofing/impersonation
 */
export async function authenticateWallet(
  socket: Socket,
  wallet: ReturnType<typeof useWallet>
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!wallet.publicKey || !wallet.signMessage) {
      reject(new Error('Wallet not connected or does not support signing'));
      return;
    }

    // Capture signMessage reference to satisfy TypeScript
    const signMessage = wallet.signMessage;
    const publicKey = wallet.publicKey;

    // Request a challenge from the server
    socket.emit('player:requestChallenge');

    // Wait for the challenge message
    socket.once('player:authChallenge', async ({ message }: { message: string }) => {
      try {
        // Sign the challenge message with the wallet's private key
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = await signMessage(messageBytes);
        const signature = bs58.encode(signatureBytes);

        // Send the signed authentication to the server
        socket.emit('player:joinWithWallet', {
          walletAddress: publicKey.toBase58(),
          signature,
          message
        });

        // Wait for authentication result
        socket.once('lobby:joined', () => {
          resolve();
        });

        socket.once('lobby:joinFailed', (errorMessage: string) => {
          reject(new Error(errorMessage));
        });

      } catch (error) {
        reject(error);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      reject(new Error('Authentication timeout'));
    }, 30000);
  });
}