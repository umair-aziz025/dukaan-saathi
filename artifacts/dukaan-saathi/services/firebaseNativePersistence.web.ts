import type { Persistence } from 'firebase/auth';

export function getNativeAuthPersistence(): Persistence | null {
  return null;
}
