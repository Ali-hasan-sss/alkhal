import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/src/api';
import { useAuth } from '@/src/auth';
import { colors } from '@/src/theme';

export default function LoginScreen() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('owner@alkhal.local');
  const [password, setPassword] = useState('ChangeMe!123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Redirect href="/pos" />;
  }

  async function onSubmit() {
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/pos');
    } catch (err) {
      if (err instanceof Error && err.message === 'NO_POS_ACCESS') {
        setError('هذا الحساب لا يملك صلاحية نقطة البيع');
      } else if (err instanceof ApiError) {
        setError(err.messageAr);
      } else {
        setError('تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={styles.card}>
          <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.sub}>نقطة البيع</Text>
          <Text style={styles.label}>البريد الإلكتروني</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable disabled={loading} onPress={onSubmit} style={[styles.button, loading && styles.disabled]}>
            <Text style={styles.buttonText}>{loading ? 'جاري الدخول…' : 'دخول'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  wrap: { flex: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.line,
  },
  logo: { width: 160, height: 160, alignSelf: 'center', marginBottom: 8 },
  sub: { color: colors.orange, fontSize: 18, textAlign: 'center', marginBottom: 24, marginTop: 4 },
  label: { color: colors.ink, marginBottom: 6, textAlign: 'right' },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
    textAlign: 'right',
    backgroundColor: colors.cream,
    color: colors.ink,
  },
  error: { color: colors.danger, marginBottom: 12, textAlign: 'right' },
  button: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
