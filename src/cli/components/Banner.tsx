import { Text, Box } from 'ink';

export function Banner() {
  const art = `
 _  __                 _                   _
| |/ /___  _ __  ___  | |_  _ __  _   _  ___| |_
| ' // _ \\| '_ \\/ __| | __|| '__|| | | |/ __| __|
| . \\ (_) | | | \\__ \\ | |_ | |   | |_| | (__| |_
|_|\\_\\___/|_| |_|___/  \\__||_|    \\__,_|\\___|\\__|`.trimStart();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>{art}</Text>
      <Text dimColor>  Package manager for AI agent skills</Text>
    </Box>
  );
}
