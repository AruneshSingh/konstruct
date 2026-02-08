import { Text, Box } from 'ink';

interface DiffViewProps {
  diff: { added: string[]; changed: string[]; removed: string[] };
}

export function DiffView({ diff }: DiffViewProps) {
  return (
    <Box flexDirection="column" paddingLeft={4}>
      {diff.added.map((f, i) => (
        <Text key={`a-${i}`} color="green">+ {f}</Text>
      ))}
      {diff.changed.map((f, i) => (
        <Text key={`c-${i}`} color="yellow">~ {f}</Text>
      ))}
      {diff.removed.map((f, i) => (
        <Text key={`r-${i}`} color="red">- {f}</Text>
      ))}
    </Box>
  );
}
