import { TeachingAside } from './TeachingAside'

interface PitfallProps {
  text: string
  title?: string
}

export function Pitfall({ text, title }: PitfallProps) {
  return <TeachingAside label="注意边界" text={text} title={title} tone="pitfall" />
}

export type { PitfallProps }
