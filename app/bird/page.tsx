import type { Metadata } from 'next';
import VoiceBird from '@/components/VoiceBird';

export const metadata: Metadata = { title: 'Rock Bird Voice' };

export default function BirdPage() {
  return <VoiceBird />;
}
