interface CodeBlockProps {
  children: string;
}

export function CodeBlock({ children }: CodeBlockProps) {
  return (
    <pre>
      <code>{children}</code>
    </pre>
  );
}
