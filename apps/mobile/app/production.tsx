import { useEffect } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { OwnerShell } from '@/src/shell';

/** Merged into /recipes (recipes + prep tabs). */
export default function ProductionRedirectScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/recipes?tab=prep');
  }, [router]);
  return (
    <OwnerShell title="الوصفات والتحضير">
      <Text style={{ padding: 16, textAlign: 'right', color: '#666' }}>جاري التحويل…</Text>
    </OwnerShell>
  );
}
