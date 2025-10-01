import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// Initialize the Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Retrieves a player's stats from the database or creates a new entry if one doesn't exist.
 * @param {string} walletAddress The player's Solana wallet address.
 * @returns {Promise<object|null>} The player's data object or null on error.
 */
export const getPlayerStats = async (walletAddress) => {
  let { data: player, error } = await supabase
    .from("players")
    .select("*")
    .eq("wallet_address", walletAddress)
    .single();

  if (error && error.code === "PGRST116") {
    // PGRST116: "The result contains 0 rows" - Player does not exist, so create them.
    console.log(`Player not found for ${walletAddress}. Creating new entry.`);
    const { data: newPlayer, error: insertError } = await supabase
      .from("players")
      .insert({ wallet_address: walletAddress, username: "Gladiator" }) // Default username
      .select()
      .single();

    if (insertError) {
      console.error("Error creating new player:", insertError);
      return null;
    }
    return newPlayer;
  } else if (error) {
    console.error("Error fetching player stats:", error);
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
    .from("players")
    .update(updates)
    .eq("wallet_address", walletAddress)
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
  const { error } = await supabase.rpc("increment_stat", {
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