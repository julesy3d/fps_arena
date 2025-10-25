/**
 * Formats token amounts with smart abbreviations
 * < 1,000: "420 $SHOT"
 * 1,000 - 999,999: "1.4K $SHOT"
 * 1,000,000+: "10.5M $SHOT"
 */
export function formatTokenAmount(amount: number, includeSymbol: boolean = true): string {
  const symbol = includeSymbol ? ' $SHOT' : '';

  if (amount < 1000) {
    return `${amount.toLocaleString()}${symbol}`;
  }

  if (amount < 1000000) {
    const k = amount / 1000;
    return `${k.toFixed(k < 10 ? 1 : 0)}K${symbol}`;
  }

  const m = amount / 1000000;
  return `${m.toFixed(m < 10 ? 1 : 0)}M${symbol}`;
}

/**
 * Formats with explicit sign for gains/losses
 */
export function formatTokenChange(amount: number, includeSymbol: boolean = true): string {
  const sign = amount >= 0 ? '+' : '';
  return `${sign}${formatTokenAmount(amount, includeSymbol)}`;
}
