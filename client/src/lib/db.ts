import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client with SERVICE ROLE KEY
// This bypasses RLS - server has full database access
// ⚠️ NEVER expose this key to clients (browser)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    // We don't throw here to allow build time to pass if envs are missing,
    // but runtime will fail if used.
    console.warn('SUPABASE_URL or SUPABASE_SERVICE_KEY not found in environment variables');
}

const supabase = createClient(
    supabaseUrl || '',
    supabaseServiceKey || '',
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

/**
 * Checks if a bet transaction signature has already been used.
 * @param {string} signature The transaction signature.
 * @returns {Promise<boolean>} True if the signature exists, false otherwise.
 */
export async function checkSignatureExists(signature: string): Promise<boolean> {
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Database not configured, skipping signature check (FAIL OPEN/CLOSED?)');
        // If DB is not configured, we should probably fail closed for security,
        // but for now let's log error and return false to not break dev if envs missing?
        // NO, security first: fail closed.
        return true;
    }

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
export async function logBetTransaction(signature: string, walletAddress: string, amount: number) {
    if (!supabaseUrl || !supabaseServiceKey) return;

    const { error } = await supabase
        .from('bet_transactions')
        .insert([{ signature, wallet_address: walletAddress, amount }]);

    if (error) {
        console.error('Failed to log bet transaction:', error);
        // We throw here because if we can't log it, we shouldn't process it?
        // Or maybe we just log the error.
        // If we don't throw, the bet proceeds.
        // Ideally we want to ensure it's logged.
        throw new Error('Failed to log bet transaction');
    }
}
