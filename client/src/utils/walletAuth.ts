/**
 * Wallet Authentication Utility - FIXED VERSION
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

    const signMessage = wallet.signMessage;
    const publicKey = wallet.publicKey;

    let isResolved = false;
    let challengeListener: any;
    let joinedListener: any;
    let failedListener: any;
    let timeoutId: NodeJS.Timeout;

    // Cleanup function
    const cleanup = () => {
      if (challengeListener) socket.off('player:authChallenge', challengeListener);
      if (joinedListener) socket.off('lobby:joined', joinedListener);
      if (failedListener) socket.off('lobby:joinFailed', failedListener);
      if (timeoutId) clearTimeout(timeoutId);
    };

    // Timeout handler
    timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        reject(new Error('Authentication timeout - no response from server'));
      }
    }, 30000);

    // Challenge handler
    challengeListener = async ({ message }: { message: string }) => {
      console.log('📨 Received auth challenge from server');
      
      try {
        console.log('🔏 Requesting wallet signature...');
        
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = await signMessage(messageBytes);
        const signature = bs58.encode(signatureBytes);

        console.log('✅ Signature obtained, sending to server');

        socket.emit('player:joinWithWallet', {
          walletAddress: publicKey.toBase58(),
          signature,
          message
        });

      } catch (error) {
        console.error('❌ Signature failed:', error);
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(error);
        }
      }
    };

    // Success handler
    joinedListener = () => {
      console.log('✅ Authentication successful!');
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve();
      }
    };

    // Failure handler
    failedListener = (errorMessage: string) => {
      console.error('❌ Authentication failed:', errorMessage);
      if (!isResolved) {
        isResolved = true;
        cleanup();
        reject(new Error(errorMessage));
      }
    };

    // Register all listeners
    socket.once('player:authChallenge', challengeListener);
    socket.once('lobby:joined', joinedListener);
    socket.once('lobby:joinFailed', failedListener);

    // Request challenge
    console.log('🚀 Requesting authentication challenge...');
    socket.emit('player:requestChallenge');
  });
}