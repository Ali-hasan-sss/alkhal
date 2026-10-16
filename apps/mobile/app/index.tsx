import { ActivityIndicator, Image, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/src/auth';
import { colors } from '@/src/theme';

export default function Index() {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
        <Image source={require('../assets/logo.png')} style={{ width: 180, height: 180, marginBottom: 20 }} resizeMode="contain" />
        <ActivityIndicator color={colors.orange} size="large" />
      </View>
    );
  }
  if (!user) {
    return <Redirect href="/login" />;
  }
  return <Redirect href="/pos" />;
}
