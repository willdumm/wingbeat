/**
 * The Flights and Duty tabs' header options that put the instance lockup (brand.tsx) at the
 * bar's top left (instance-header.tsx has Android's). iOS always centers a custom title, so
 * here it's a left item, without the glass capsule that bar buttons get.
 */
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { InstanceLockup } from './brand';

export const instanceHeaderOptions: NativeStackNavigationOptions = {
  unstable_headerLeftItems: () => [{ type: 'custom', element: <InstanceLockup />, hidesSharedBackground: true }],
};
