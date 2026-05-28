/**
 * AttendanceScreen.js
 * Landing screen for the Attendance tab.
 * Shows a "Start Verification" button and recent attendance stats.
 */

import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  PermissionsAndroid,
  Platform,
  Alert,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING, RADIUS, SHADOWS, FONT_SIZES, FONTS} from '../utils/theme';
import {DatabaseService} from '../modules/DatabaseService';
import moment from 'moment';

const AttendanceScreen = ({navigation}) => {
  const [stats, setStats] = useState({total: 0, today: 0, pending: 0});
  const [recentLogs, setRecentLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [enrolledCount, setEnrolledCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [logs, enrolled] = await Promise.all([
        DatabaseService.getAllAttendance(10),
        DatabaseService.getPersonnelCount(),
      ]);

      const today = moment().startOf('day');
      const todayCount = logs.filter(l =>
        moment(l.timestamp).isSame(today, 'day'),
      ).length;
      const pendingCount = logs.filter(l => l.synced === 0).length;

      setStats({
        total: await DatabaseService.getAttendanceCount(),
        today: todayCount,
        pending: pendingCount,
      });
      setRecentLogs(logs.slice(0, 5));
      setEnrolledCount(enrolled);
    } catch (err) {
      console.error('[Attendance] Load error:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleStartVerification = useCallback(async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission Required',
          message: 'SecureFace needs your camera for face verification.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'Permission Denied',
          'Camera access is required. Please enable it in device Settings.',
        );
        return;
      }
    }
    navigation.navigate('CameraAttendance');
  }, [navigation]);

  const getStatusStyle = status => ({
    color:
      status === 'matched'
        ? COLORS.success
        : status === 'failed'
        ? COLORS.error
        : COLORS.warning,
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>

      {/* ── Hero CTA ── */}
      <View style={styles.heroBanner}>
        <Icon name="face-recognition" size={48} color="#fff" />
        <Text style={styles.heroTitle}>Face Verification</Text>
        <Text style={styles.heroSubtitle}>
          Liveness check + recognition, fully offline
        </Text>
        <TouchableOpacity
          style={[
            styles.startBtn,
            enrolledCount === 0 && styles.startBtnDisabled,
          ]}
          onPress={handleStartVerification}
          disabled={enrolledCount === 0}
          activeOpacity={0.85}
          testID="btn-start-verification">
          <Icon name="play-circle" size={22} color={COLORS.primary} />
          <Text style={styles.startBtnText}>Start Verification</Text>
        </TouchableOpacity>
        {enrolledCount === 0 && (
          <Text style={styles.noEnrollWarning}>
            ⚠️  No personnel enrolled yet. Go to the Enroll tab first.
          </Text>
        )}
      </View>

      {/* ── Today Stats ── */}
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statNum}>{stats.today}</Text>
          <Text style={styles.statLbl}>Today</Text>
        </View>
        <View style={[styles.statChip, styles.statChipMiddle]}>
          <Text style={styles.statNum}>{stats.total}</Text>
          <Text style={styles.statLbl}>Total</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statNum, stats.pending > 0 && {color: COLORS.warning}]}>
            {stats.pending}
          </Text>
          <Text style={styles.statLbl}>Pending Sync</Text>
        </View>
      </View>

      {/* ── Recent Verifications ── */}
      <Text style={styles.sectionTitle}>Recent Verifications</Text>
      {recentLogs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Icon name="clipboard-outline" size={32} color={COLORS.textDisabled} />
          <Text style={styles.emptyText}>No verifications recorded yet</Text>
        </View>
      ) : (
        recentLogs.map(log => (
          <View key={log.id} style={styles.logCard}>
            <View
              style={[
                styles.logAvatar,
                {
                  backgroundColor:
                    log.status === 'matched'
                      ? COLORS.successLight
                      : COLORS.errorLight,
                },
              ]}>
              <Icon
                name={log.status === 'matched' ? 'check' : 'close'}
                size={18}
                color={
                  log.status === 'matched' ? COLORS.success : COLORS.error
                }
              />
            </View>
            <View style={styles.logBody}>
              <Text style={styles.logName}>
                {log.personnel_name || 'Unknown'}
              </Text>
              <Text style={styles.logTime}>
                {moment(log.timestamp).format('DD MMM, HH:mm:ss')}
              </Text>
            </View>
            <View style={styles.logRight}>
              <Text style={[styles.logStatus, getStatusStyle(log.status)]}>
                {log.status.toUpperCase().replace('_', ' ')}
              </Text>
              {log.confidence > 0 && (
                <Text style={styles.logConf}>
                  {(log.confidence * 100).toFixed(1)}%
                </Text>
              )}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  content: {padding: SPACING.md, paddingBottom: SPACING.xl},
  heroBanner: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  heroTitle: {
    color: '#fff',
    fontSize: FONT_SIZES['2xl'],
    ...FONTS.bold,
    marginTop: SPACING.sm,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  startBtn: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  startBtnDisabled: {opacity: 0.5},
  startBtnText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    marginLeft: SPACING.sm,
  },
  noEnrollWarning: {
    color: COLORS.secondaryLight,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    ...SHADOWS.sm,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  statChip: {
    flex: 1,
    padding: SPACING.md,
    alignItems: 'center',
  },
  statChipMiddle: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
  },
  statNum: {
    fontSize: FONT_SIZES['2xl'],
    ...FONTS.bold,
    color: COLORS.text,
  },
  statLbl: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  emptyText: {color: COLORS.textSecondary, marginTop: SPACING.sm},
  logCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  logAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  logBody: {flex: 1},
  logName: {fontSize: FONT_SIZES.base, ...FONTS.medium, color: COLORS.text},
  logTime: {fontSize: FONT_SIZES.xs, color: COLORS.textSecondary},
  logRight: {alignItems: 'flex-end'},
  logStatus: {fontSize: FONT_SIZES.xs, ...FONTS.bold},
  logConf: {fontSize: FONT_SIZES.xs, color: COLORS.textSecondary},
});

export default AttendanceScreen;
