import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// OS Detection
export const isMac = navigator.userAgent.includes('Mac');
export const isWindows = navigator.userAgent.includes('Windows');
