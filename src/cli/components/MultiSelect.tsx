import { Text, Box, useInput } from 'ink';
import { useState } from 'react';

interface MultiSelectProps {
  prompt: string;
  items: string[];
  onConfirm: (indices: number[]) => void;
}

export function MultiSelect({ prompt, items, onConfirm }: MultiSelectProps) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((prev) => (prev - 1 + items.length) % items.length);
    } else if (key.downArrow) {
      setCursor((prev) => (prev + 1) % items.length);
    } else if (input === ' ') {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(cursor)) next.delete(cursor);
        else next.add(cursor);
        return next;
      });
    } else if (key.return) {
      onConfirm([...selected].sort((a, b) => a - b));
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
      {items.map((item, i) => {
        const arrow = i === cursor ? <Text color="cyan">›</Text> : <Text> </Text>;
        const box = selected.has(i) ? <Text color="green">☑</Text> : <Text dimColor>☐</Text>;
        const label = i === cursor ? <Text bold>{item}</Text> : <Text>{item}</Text>;
        return (
          <Text key={i}>
            {'  '}{arrow} {box} {label}
          </Text>
        );
      })}
      <Text dimColor>  ↑↓ move  space select  enter confirm</Text>
    </Box>
  );
}
