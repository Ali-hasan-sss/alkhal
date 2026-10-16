import { useEffect } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { OwnerShell } from '@/src/shell';

/** Merged into /inventory (materials + stock tabs). */
export default function IngredientsRedirectScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/inventory?tab=materials');
  }, [router]);
  return (
    <OwnerShell title="المواد والمخزون">
      <Text style={{ padding: 16, textAlign: 'right', color: '#666' }}>جاري التحويل…</Text>
    </OwnerShell>
  );
}
