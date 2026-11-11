/**
 * The design tokens for the current color scheme: the same values the web's CSS
 * variables come from (@wingbeat/core/tokens).
 */
import { useColorScheme } from 'react-native';
import { darkTokens, lightTokens, type TokenName } from '@wingbeat/core/tokens';

export type Tokens = Record<TokenName, string>;

const dark: Tokens = { ...lightTokens, ...darkTokens };

export function useTokens(): Tokens {
  return useColorScheme() === 'dark' ? dark : lightTokens;
}

/** A length token ('10px') as React Native's number. */
export const px = (token: string) => parseFloat(token);
