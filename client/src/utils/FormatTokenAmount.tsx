/**
* Formats token amounts with smart abbreviations
* Input amount is ALWAYS in whole tokens (integers)
*
* Examples:
* 420 → "420 $SHOT"
* 1400 → "1.4K $SHOT"
* 10500000 → "10.5M $SHOT"
*/
export function formatTokenAmount(amount: number, includeSymbol: boolean = true): string {
const symbol = includeSymbol ? ' $SHOT' : ''; // ← Changed from '◎'

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
* Formats with explicit + or - sign
*/
export function formatTokenChange(amount: number, includeSymbol: boolean = true): string {
const sign = amount >= 0 ? '+' : '';
return `${sign}${formatTokenAmount(amount, includeSymbol)}`;
}
