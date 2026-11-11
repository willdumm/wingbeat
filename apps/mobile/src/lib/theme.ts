/**
 * The design tokens for the current color scheme: the same values the web's CSS
 * variables come from (@wingbeat/core/tokens). The scheme is the phone's unless Settings
 * picked Light or Dark, which overrides it for the whole app, native headers and tabs
 * included (Appearance.setColorScheme).
 */
import { useCallback } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { darkTokens, lightTokens, type TokenName } from '@wingbeat/core/tokens';
import { parseTheme, THEME_KEY, type ThemeChoice } from './prefs';
import { readStored, useStoredState } from './stored-state';

export type Tokens = Record<TokenName, string>;

const dark: Tokens = { ...lightTokens, ...darkTokens };

export function useTokens(): Tokens {
  return useColorScheme() === 'dark' ? dark : lightTokens;
}

/** A length token ('10px') as React Native's number. */
export const px = (token: string) => parseFloat(token);

const applyTheme = (choice: ThemeChoice) => Appearance.setColorScheme(choice === 'system' ? 'auto' : choice);

/** Applies the stored theme; called once at launch, before the first render. */
export const applyStoredTheme = () => applyTheme(readStored(THEME_KEY, parseTheme));

/** The theme Settings picked, and picking one (stored and applied at once). */
export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useStoredState(THEME_KEY, parseTheme);
  const pick = useCallback((c: ThemeChoice) => { setChoice(c); applyTheme(c); }, [setChoice]);
  return [choice, pick];
}
