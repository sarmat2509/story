export type ReferenceImageKind = 'character' | 'object';

export type ReferenceKindInput = {
  source?: string;
  type?: string;
};

export function inferReferenceKind(ref: ReferenceKindInput): ReferenceImageKind {
  if (ref.source === 'environment' || ref.source === 'outfit_plate') {
    return 'object';
  }
  if (ref.type === 'environment_reference' || ref.type === 'outfit_plate_reference') {
    return 'object';
  }
  if (
    ref.type === 'imaginary' ||
    ref.type === 'child_reference' ||
    ref.type === 'character_reference' ||
    ref.type === 'dressed_turnaround_reference'
  ) {
    return 'character';
  }
  return 'character';
}
