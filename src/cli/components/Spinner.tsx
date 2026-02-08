import { Text } from 'ink';
import { useState, useEffect } from 'react';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface SpinnerProps {
  label: string;
}

export function Spinner({ label }: SpinnerProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(id);
  }, []);

  return (
    <Text>
      <Text color="cyan">{FRAMES[frame]}</Text> {label}
    </Text>
  );
}
