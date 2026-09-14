import { TeachingAside } from './TeachingAside'

interface EngineeringNoteProps {
  text: string
  title?: string
}

export function EngineeringNote({ text, title }: EngineeringNoteProps) {
  return <TeachingAside label="工程实践" text={text} title={title} tone="engineering" />
}

export type { EngineeringNoteProps }
