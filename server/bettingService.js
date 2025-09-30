export const bettingService = {
  /**
   * Simulates paying the entry fee.
   * @param {string} playerId The ID of the player paying the fee.
   * @param {number} amount The amount being paid.
   * @returns {Promise<boolean>} A promise that resolves to true if successful.
   */
  payEntryFee: async (playerId, amount) => {
    console.log(`[Betting Service] Simulating ${amount} token entry fee for ${playerId}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`[Betting Service] Entry fee successful for ${playerId}`);
    return true;
  },

  /**
   * Simulates placing an additional bet.
   * @param {string} playerId The ID of the player placing the bet.
   * @param {number} amount The amount to bet.
   * @returns {Promise<boolean>} A promise that resolves to true if the bet is successful.
   */
  placeBet: async (playerId, amount) => {
    console.log(`[Betting Service] Simulating additional bet of ${amount} for player ${playerId}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`[Betting Service] Bet successful for ${playerId}`);
    return true;
  },
};