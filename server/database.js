import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Initialize the Supabase client with SERVICE ROLE KEY
// This bypasses RLS - server has full database access
// ⚠️ NEVER expose this key to clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceKey) {
  console.error('FATAL: SUPABASE_SERVICE_KEY not found in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Retrieves a player's stats from the database or creates a new entry if one doesn't exist.
 * @param {string} walletAddress The player's Solana wallet address.
 * @returns {Promise<object|null>} The player's data object or null on error.
 */
export const getPlayerStats = async (walletAddress) => {
  let { data: player, error } = await supabase
    .from('players')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (error && error.code === 'PGRST116') {
    console.log(`Player not found for ${walletAddress}. Creating new entry.`);

    // Default username is shortened wallet address
    const defaultUsername = `${walletAddress.substring(0, 4)}...${walletAddress.substring(walletAddress.length - 4)}`;

    const { data: newPlayer, error: insertError } = await supabase
      .from('players')
      .insert({ wallet_address: walletAddress, username: defaultUsername })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating new player:', insertError);
      return null;
    }
    return newPlayer;
  } else if (error) {
    console.error('Error fetching player stats:', error);
    return null;
  }

  return player;
};

/**
 * Updates a specific player's stats in the database.
 * @param {string} walletAddress The player's Solana wallet address.
 * @param {object} updates An object containing the fields to update.
 * @returns {Promise<object|null>} The updated player data or null on error.
 */
export const updatePlayerStats = async (walletAddress, updates) => {
  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('wallet_address', walletAddress)
    .select()
    .single();

  if (error) {
    console.error(`Error updating stats for ${walletAddress}:`, error);
    return null;
  }
  return data;
};

/**
 * Atomically increments a numeric field for a player.
 * @param {string} walletAddress The player's Solana wallet address.
 * @param {string} field The name of the field to increment (e.g., 'kills', 'wins').
 * @param {number} value The value to increment by.
 */
export const incrementPlayerStat = async (walletAddress, field, value) => {
  const { error } = await supabase.rpc('increment_stat', {
    p_wallet_address: walletAddress,
    p_field: field,
    p_value: value,
  });

  if (error) {
    console.error(
      `Error incrementing ${field} for ${walletAddress}:`,
      error,
    );
  }
};

export async function logTransaction(transactionData) {
  const { data, error } = await supabase
    .from('payout_transactions')
    .insert([transactionData])
    .select()
    .single();

  if (error) {
    console.error('Failed to log transaction:', error);
    return null;
  }

  return data.id;
}

export async function updateTransaction(txId, updates) {
  const { error } = await supabase
    .from('payout_transactions')
    .update(updates)
    .eq('id', txId);

  if (error) {
    console.error('Failed to update transaction:', error);
  }
}

/**
 * Checks if a bet transaction signature has already been used.
 * @param {string} signature The transaction signature.
 * @returns {Promise<boolean>} True if the signature exists, false otherwise.
 */
export async function checkSignatureExists(signature) {
  const { data, error } = await supabase
    .from('bet_transactions')
    .select('signature')
    .eq('signature', signature)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
    console.error('Error checking signature:', error);
    // Fail closed: if DB error, assume it exists to prevent replay
    return true;
  }

  return !!data;
}

/**
 * Logs a bet transaction to prevent replay attacks.
 * @param {string} signature The transaction signature.
 * @param {string} walletAddress The player's wallet address.
 * @param {number} amount The amount of the bet.
 */
export async function logBetTransaction(signature, walletAddress, amount) {
  const { error } = await supabase
    .from('bet_transactions')
    .insert([{ signature, wallet_address: walletAddress, amount }]);

  if (error) {
    console.error('Failed to log bet transaction:', error);
    throw new Error('Failed to log bet transaction');
  }
}