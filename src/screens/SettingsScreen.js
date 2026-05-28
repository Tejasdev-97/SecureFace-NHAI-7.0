/**
 * SettingsScreen.js
 * App configuration: similarity threshold, auto-sync, retention, AWS config
 */

import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import moment from 'moment';
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING, RADIUS, SHADOWS, FONT_SIZES, FONTS} from '../utils/theme';
import {FaceRecognitionModule} from '../modules/FaceRecognitionModule';
import {SyncManager} from '../modules/SyncManager';
import {DatabaseService} from '../modules/DatabaseService';

const SettingsScreen = () => {
  const [threshold, setThreshold] = useState(0.60);
  const [autoSync, setAutoSync] = useState(true);
  const [retentionDays, setRetentionDays] = useState(30);
  const [awsEndpoint, setAwsEndpoint] = useState('');
  const [awsApiKey, setAwsApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [personnelList, setPersonnelList] = useState([]);
  const [showPersonnelModal, setShowPersonnelModal] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const [thresh, syncSettings, count, personnel] = await Promise.all([
      FaceRecognitionModule.getThreshold(),
      SyncManager.loadSettings(),
      DatabaseService.getPersonnelCount(),
      DatabaseService.getAllPersonnel(),
    ]);
    setThreshold(thresh);
    setAutoSync(syncSettings.autoSync);
    setRetentionDays(syncSettings.retentionDays);
    setAwsEndpoint(syncSettings.endpoint);
    setAwsApiKey(syncSettings.apiKey);
    setEnrolledCount(count);
    setPersonnelList(personnel);
  };

  const handleDeletePersonnel = (person) => {
    Alert.alert(
      'Delete Personnel',
      `Are you sure you want to delete ${person.name} (ID: ${person.id})?\n\nThis will completely delete their face templates and they will not be able to mark attendance.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await DatabaseService.deletePersonnel(person.id);
              FaceRecognitionModule.invalidateCache();
              Alert.alert('Deleted', `${person.name} has been removed.`);
              loadSettings(); // refresh list and count
            } catch (err) {
              Alert.alert('Error', 'Failed to delete personnel: ' + err.message);
            }
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        FaceRecognitionModule.setThreshold(threshold),
        SyncManager.saveSettings({
          endpoint: awsEndpoint.trim(),
          apiKey: awsApiKey.trim(),
          autoSync,
          retentionDays: parseInt(retentionDays, 10) || 30,
        }),
      ]);
      Alert.alert('Settings Saved', 'All settings have been updated.');
    } catch (err) {
      Alert.alert('Error', 'Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const result = await SyncManager.syncNow(true); // Demo mode
      Alert.alert(
        result.success ? '✅ Sync Complete' : '❌ Sync Failed',
        result.success
          ? `${result.syncedCount} records uploaded and marked synced.`
          : result.error || 'Sync failed.',
      );
    } finally {
      setSyncing(false);
    }
  };

  const handlePurgeData = () => {
    Alert.alert(
      'Confirm Purge',
      `This will delete ALL local attendance records older than ${retentionDays} days that have been synced. This cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Purge',
          style: 'destructive',
          onPress: async () => {
            await DatabaseService.purgeLocalCache(retentionDays);
            Alert.alert('Done', 'Old synced records purged.');
          },
        },
      ],
    );
  };

  const SectionHeader = ({icon, title}) => (
    <View style={styles.sectionHeader}>
      <Icon name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  const SettingRow = ({label, sublabel, children}) => (
    <View style={styles.settingRow}>
      <View style={styles.settingLabel}>
        <Text style={styles.settingLabelText}>{label}</Text>
        {sublabel && <Text style={styles.settingSubLabel}>{sublabel}</Text>}
      </View>
      {children}
    </View>
  );

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Recognition Settings ── */}
      <View style={styles.card}>
        <SectionHeader icon="face-recognition" title="Recognition" />

        <Text style={styles.label}>Similarity Threshold</Text>
        <Text style={styles.thresholdVal}>
          {(threshold * 100).toFixed(0)}%{' '}
          <Text style={styles.thresholdNote}>
            ({threshold >= 0.75 ? 'Strict' : threshold >= 0.55 ? 'Balanced' : 'Lenient'})
          </Text>
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={0.4}
          maximumValue={0.95}
          step={0.01}
          value={threshold}
          onValueChange={setThreshold}
          minimumTrackTintColor={COLORS.primary}
          maximumTrackTintColor={COLORS.border}
          thumbTintColor={COLORS.primary}
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabelText}>Lenient (0.40)</Text>
          <Text style={styles.sliderLabelText}>Strict (0.95)</Text>
        </View>
        <Text style={styles.hint}>
          Higher = stricter matching. Default: 82%. For demo, 80–85% is recommended.
        </Text>
      </View>

      {/* ── Sync Settings ── */}
      <View style={styles.card}>
        <SectionHeader icon="cloud-sync" title="AWS Sync" />

        <SettingRow
          label="Auto-Sync"
          sublabel="Sync when internet is restored">
          <Switch
            value={autoSync}
            onValueChange={setAutoSync}
            trackColor={{false: COLORS.border, true: COLORS.primary + '66'}}
            thumbColor={autoSync ? COLORS.primary : COLORS.textDisabled}
          />
        </SettingRow>

        <Text style={styles.label}>Retention Policy (days)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={String(retentionDays)}
          onChangeText={v => setRetentionDays(v.replace(/[^0-9]/g, ''))}
          maxLength={3}
        />
        <Text style={styles.hint}>
          Synced records older than this will be purged from device storage.
        </Text>

        <Text style={styles.label}>AWS API Gateway Endpoint</Text>
        <TextInput
          style={styles.input}
          placeholder="https://your-api.execute-api.region.amazonaws.com/prod"
          value={awsEndpoint}
          onChangeText={setAwsEndpoint}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>API Key (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Leave blank for demo mode"
          value={awsApiKey}
          onChangeText={setAwsApiKey}
          secureTextEntry={true}
          autoCapitalize="none"
        />
        <Text style={styles.hint}>
          If endpoint is not configured, sync runs in DEMO MODE (local simulation).
        </Text>
      </View>

      {/* ── Data Management ── */}
      <View style={styles.card}>
        <SectionHeader icon="database" title="Data Management" />
        <SettingRow label="Enrolled Personnel" sublabel="Total records in local DB">
          <Text style={styles.countBadge}>{enrolledCount}</Text>
        </SettingRow>

        <TouchableOpacity
          style={[styles.actionBtn, {backgroundColor: COLORS.secondary, marginTop: SPACING.xs, marginBottom: SPACING.xs}]}
          onPress={() => setShowPersonnelModal(true)}>
          <Icon name="account-search" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>View Enrolled Personnel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleManualSync}
          disabled={syncing}>
          {syncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="cloud-upload" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Manual Sync (Demo)</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.dangerBtn]}
          onPress={handlePurgeData}>
          <Icon name="delete-sweep" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>Purge Old Cache</Text>
        </TouchableOpacity>
      </View>

      {/* ── System Info ── */}
      <View style={styles.card}>
        <SectionHeader icon="information" title="System Info" />
        {[
          ['App Version', '1.0.0 (Hackathon Build)'],
          ['Mode', 'Offline-First'],
          ['AI Model', 'MobileFaceNet (Simulated)'],
          ['Storage', 'SQLite (Local)'],
          ['Platform', 'React Native 0.73'],
          ['Event', 'NHAI Innovation Hackathon 7.0'],
        ].map(([k, v]) => (
          <View key={k} style={styles.infoRow}>
            <Text style={styles.infoKey}>{k}</Text>
            <Text style={styles.infoVal}>{v}</Text>
          </View>
        ))}
      </View>

      {/* ── Save Button ── */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && {opacity: 0.6}]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}>
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Icon name="content-save" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>Save Settings</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>

    {/* ── Personnel List Modal ── */}
    <Modal
      visible={showPersonnelModal}
      animationType="slide"
      onRequestClose={() => setShowPersonnelModal(false)}>
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Enrolled Personnel List</Text>
          <TouchableOpacity onPress={() => setShowPersonnelModal(false)} style={styles.closeBtn}>
            <Icon name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {personnelList.length === 0 ? (
          <View style={styles.modalEmpty}>
            <Icon name="account-off" size={48} color={COLORS.textDisabled} />
            <Text style={styles.modalEmptyText}>No personnel enrolled yet.</Text>
          </View>
        ) : (
          <FlatList
            data={personnelList}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.modalList}
            renderItem={({item}) => (
              <View style={styles.personnelItem}>
                <View style={styles.personnelInfo}>
                  <Text style={styles.personnelName}>{item.name}</Text>
                  <Text style={styles.personnelMeta}>ID: {item.id}</Text>
                  <Text style={styles.personnelMeta}>
                    Enrolled: {moment(item.created_at).format('DD MMM YYYY, HH:mm')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeletePersonnel(item)}>
                  <Icon name="trash-can-outline" size={22} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  content: {padding: SPACING.md, paddingBottom: SPACING.xl},
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    ...FONTS.medium,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  thresholdVal: {
    fontSize: FONT_SIZES.xl,
    ...FONTS.bold,
    color: COLORS.primary,
    textAlign: 'center',
  },
  thresholdNote: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    ...FONTS.regular,
  },
  slider: {width: '100%', height: 40},
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -SPACING.sm,
  },
  sliderLabelText: {fontSize: FONT_SIZES.xs, color: COLORS.textDisabled},
  hint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
    lineHeight: 18,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  settingLabel: {flex: 1},
  settingLabelText: {
    fontSize: FONT_SIZES.base,
    ...FONTS.medium,
    color: COLORS.text,
  },
  settingSubLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  input: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.base,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  countBadge: {
    backgroundColor: COLORS.infoLight,
    color: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    fontSize: FONT_SIZES.lg,
    ...FONTS.bold,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    ...SHADOWS.sm,
  },
  dangerBtn: {backgroundColor: COLORS.error},
  actionBtnText: {
    color: '#fff',
    fontSize: FONT_SIZES.sm,
    ...FONTS.bold,
    marginLeft: SPACING.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  infoKey: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    ...FONTS.regular,
  },
  infoVal: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    ...FONTS.medium,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    marginLeft: SPACING.sm,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    ...SHADOWS.sm,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    ...FONTS.bold,
    color: COLORS.text,
  },
  closeBtn: {
    padding: SPACING.xs,
  },
  modalEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalEmptyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  modalList: {
    padding: SPACING.md,
  },
  personnelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  personnelInfo: {
    flex: 1,
  },
  personnelName: {
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    color: COLORS.text,
  },
  personnelMeta: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  deleteBtn: {
    padding: SPACING.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default SettingsScreen;
