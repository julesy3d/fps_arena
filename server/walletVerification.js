/**
 * @file walletVerification.js
 * @description Cryptographic verification of Solana wallet ownership
 * Prevents players from impersonating other wallets
 */

import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * Verifies that a signature was created by the private key corresponding to the given public key
 * @param {string} walletAddress - Base58 encoded Solana public key
 * @param {string} signature - Base58 encoded signature
 * @param {string} message - The original message that was signed
 * @returns {boolean} True if signature is valid
 */
export function verifyWalletSignature(walletAddress, signature, message) {
  try {
    // Convert message to bytes
    const messageBytes = new TextEncoder().encode(message);
    
    // Decode signature from base58
    const signatureBytes = bs58.decode(signature);
    
    // Get public key bytes
    const publicKey = new PublicKey(walletAddress);
    const publicKeyBytes = publicKey.toBytes();
    
    // Verify the signature
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );
    
    return isValid;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generates a challenge message for the client to sign
 * Should be unique per connection to prevent replay attacks
 * @param {string} socketId - The socket.io connection ID
 * @returns {string} Challenge message
 */
export function generateChallengeMessage(socketId) {
  const timestamp = Date.now();
  return `Sign this message to authenticate with PotShot.gg\nSocket: ${socketId}\nTimestamp: ${timestamp}`;
}

/**
 * Validates that a challenge message is recent (within 5 minutes)
 * Prevents replay attacks with old signatures
 * @param {string} message - The challenge message
 * @returns {boolean} True if message is fresh
 */
export function isChallengeFresh(message) {
  try {
    const timestampMatch = message.match(/Timestamp: (\d+)/);
    if (!timestampMatch) return false;
    
    const timestamp = parseInt(timestampMatch[1]);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    return (now - timestamp) < fiveMinutes;
  } catch (error) {
    return false;
  }
}