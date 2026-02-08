import { Text } from 'ink';
import type { ReactNode } from 'react';

const VARIANTS = {
  success: { icon: '✓', color: 'green' },
  error: { icon: '✗', color: 'red' },
  info: { icon: 'ℹ', color: 'cyan' },
  warn: { icon: '!', color: 'yellow' },
} as const;

interface StatusMessageProps {
  variant: keyof typeof VARIANTS;
  children: ReactNode;
}

export function StatusMessage({ variant, children }: StatusMessageProps) {
  const { icon, color } = VARIANTS[variant];
  return (
    <Text>
      <Text color={color}>{icon}</Text> {children}
    </Text>
  );
}
