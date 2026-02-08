import { Text, Box, useInput } from 'ink';
import { useState } from 'react';

interface SelectProps {
  prompt: string;
  items: string[];
  onSelect: (index: number) => void;
}

export function Select({ prompt, items, onSelect }: SelectProps) {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((prev) => (prev - 1 + items.length) % items.length);
    } else if (key.downArrow) {
      setCursor((prev) => (prev + 1) % items.length);
    } else if (key.return) {
      onSelect(cursor);
    }
  });

  if (!process.stdin.isTTY) {
    return (
      <Box flexDirection="column">
        <Text bold>{prompt}</Text>
        {items.map((item, i) => (
          <Text key={i}>  {i + 1}. {item}</Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>{prompt}</Text>
      {items.map((item, i) => (
        <Text key={i}>
          {'  '}{i === cursor ? <Text color="cyan">›</Text> : ' '} {i === cursor ? <Text bold>{item}</Text> : item}
        </Text>
      ))}
      <Text dimColor>  ↑↓ move  enter select</Text>
    </Box>
  );
}
