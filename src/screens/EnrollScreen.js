/**
 * EnrollScreen.js
 * Step 1 of enrollment: Personnel ID and Name entry form
 * Step 2 navigates to CameraEnrollScreen for face capture
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING, RADIUS, SHADOWS, FONT_SIZES, FONTS} from '../utils/theme';
import {DatabaseService} from '../modules/DatabaseService';

const EnrollScreen = ({navigation}) => {
  const [personnelId, setPersonnelId] = useState('');
  const [name, setName] = useState('');
  const [checking, setChecking] = useState(false);

  const handleProceed = async () => {
    // Validate inputs
    if (!personnelId.trim()) {
      Alert.alert('Missing Field', 'Please enter a Personnel ID.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Missing Field', 'Please enter a Name.');
      return;
    }
    if (personnelId.trim().length < 3) {
      Alert.alert('Invalid ID', 'Personnel ID must be at least 3 characters.');
      return;
    }

    setChecking(true);
    try {
      // Check for duplicate Personnel ID
      const exists = await DatabaseService.personnelExists(personnelId.trim().toUpperCase());
      if (exists) {
        Alert.alert(
          'Duplicate ID',
          `Personnel ID "${personnelId.trim().toUpperCase()}" is already enrolled.\nPlease use a different ID.`,
        );
        return;
      }

      // Request camera permission at runtime (Android 6+)
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission Required',
            message: 'SecureFace needs access to your camera to capture face images for enrollment.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Permission Denied',
            'Camera access is required for face enrollment. Please enable it in your device Settings.',
          );
          return;
        }
      }

      // Proceed to camera for face capture
      navigation.navigate('CameraEnroll', {
        personnelId: personnelId.trim().toUpperCase(),
        name: name.trim(),
      });
    } catch (err) {
      Alert.alert('Error', 'Could not check database. Please try again.');
      console.error('[Enroll] Check error:', err);
    } finally {
      setChecking(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">

      {/* ── Info Banner ── */}
      <View style={styles.infoBanner}>
        <Icon name="information" size={20} color={COLORS.primary} />
        <Text style={styles.infoText}>
          Fill in personnel details and then capture the face image for enrollment.
        </Text>
      </View>

      {/* ── Form Card ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Personnel Information</Text>

        <Text style={styles.label}>Personnel ID *</Text>
        <View style={styles.inputWrap}>
          <Icon name="badge-account" size={20} color={COLORS.primary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="e.g. NHAI-001"
            value={personnelId}
            onChangeText={setPersonnelId}
            autoCapitalize="characters"
            maxLength={20}
            returnKeyType="next"
            testID="input-personnel-id"
          />
        </View>

        <Text style={styles.label}>Full Name *</Text>
        <View style={styles.inputWrap}>
          <Icon name="account" size={20} color={COLORS.primary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="e.g. Rajesh Kumar"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            maxLength={50}
            returnKeyType="done"
            testID="input-name"
          />
        </View>
      </View>

      {/* ── Steps Guide ── */}
      <View style={styles.stepsCard}>
        <Text style={styles.cardTitle}>Enrollment Steps</Text>
        {[
          ['1', 'Enter Personnel ID and Name', 'form-textbox'],
          ['2', 'Capture face images (front camera)', 'camera-front'],
          ['3', 'Face embedding generated locally', 'cpu-64-bit'],
          ['4', 'Data stored offline in SQLite', 'database-check'],
        ].map(([step, label, icon]) => (
          <View key={step} style={styles.step}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNum}>{step}</Text>
            </View>
            <Icon name={icon} size={18} color={COLORS.primary} style={styles.stepIcon} />
            <Text style={styles.stepLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ── CTA Button ── */}
      <TouchableOpacity
        style={[styles.btn, checking && styles.btnDisabled]}
        onPress={handleProceed}
        activeOpacity={0.85}
        disabled={checking}
        testID="btn-proceed">
        {checking ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Icon name="camera-front" size={20} color="#fff" />
            <Text style={styles.btnText}>Proceed to Face Capture</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.infoLight,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  infoText: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.info,
    ...FONTS.regular,
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  cardTitle: {
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    ...FONTS.medium,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: FONT_SIZES.base,
    color: COLORS.text,
    ...FONTS.regular,
  },
  stepsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  stepNum: {
    color: '#fff',
    fontSize: FONT_SIZES.xs,
    ...FONTS.bold,
  },
  stepIcon: {
    marginRight: SPACING.sm,
  },
  stepLabel: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    marginLeft: SPACING.sm,
  },
});

export default EnrollScreen;
