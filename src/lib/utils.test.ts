import { expect, test, describe } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  test('should merge Tailwind classes correctly', () => {
    expect(cn('px-2', 'py-1', 'px-4')).toBe('py-1 px-4');
  });

  test('should handle conditional classes', () => {
    expect(cn('text-red-500', false && 'text-blue-500', true && 'font-bold')).toBe('text-red-500 font-bold');
  });

  test('should handle empty inputs', () => {
    expect(cn('', null, undefined)).toBe('');
  });

  test('should handle mixed inputs', () => {
    expect(cn('bg-red-500', 'text-white', 'p-4', 'bg-blue-500')).toBe('text-white p-4 bg-blue-500');
  });
});
