const AVATAR_GRADIENT_COUNT = 6;

export function avatarGradientIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return (hash >>> 0) % AVATAR_GRADIENT_COUNT;
}

export function avatarGradientClass(name: string): string {
  return `avatar-gradient-${avatarGradientIndex(name)}`;
}
