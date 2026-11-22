/**
 * The Flights and Duty tabs' header options that put the instance lockup (brand.tsx) at the
 * bar's top left: on Android, the title, which is already at the left. iOS's are in
 * instance-header.ios.tsx.
 */
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { InstanceLockup } from './brand';

export const instanceHeaderOptions: NativeStackNavigationOptions = { headerTitle: () => <InstanceLockup /> };
