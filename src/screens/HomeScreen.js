/**
 * HomeScreen.js
 * Dashboard — shows stats, recent activity, and quick actions
 */

import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING, RADIUS, SHADOWS, FONT_SIZES, FONTS} from '../utils/theme';
import {DatabaseService} from '../modules/DatabaseService';
import {SyncManager} from '../modules/SyncManager';
import moment from 'moment';

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({icon, label, value, color, bgColor}) => (
  <View style={[styles.statCard, {borderLeftColor: color}]}>
    <View style={[styles.statIconWrap, {backgroundColor: bgColor}]}>
      <Icon name={icon} size={24} color={color} />
    </View>
    <View style={styles.statContent}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  </View>
);

const QuickAction = ({icon, label, color, onPress}) => (
  <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.8}>
    <View style={[styles.qaIconWrap, {backgroundColor: color}]}>
      <Icon name={icon} size={28} color="#fff" />
    </View>
    <Text style={styles.qaLabel}>{label}</Text>
  </TouchableOpacity>
);

// ─── HomeScreen ───────────────────────────────────────────────────────────────

const HomeScreen = ({navigation}) => {
  const [stats, setStats] = useState({
    enrolledCount: 0,
    totalAttendance: 0,
    pendingSync: 0,
  });
  const [recentLogs, setRecentLogs] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [s, logs, syncTime] = await Promise.all([
        DatabaseService.getDashboardStats(),
        DatabaseService.getAllAttendance(5),
        SyncManager.getLastSyncTime(),
      ]);
      setStats(s);
      setRecentLogs(logs);
      setLastSync(syncTime);
    } catch (err) {
      console.error('[Home] Load error:', err);
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

  const getStatusColor = status => {
    if (status === 'matched') {return COLORS.success;}
    if (status === 'failed' || status === 'liveness_failed') {return COLORS.error;}
    return COLORS.warning;
  };

  const getStatusIcon = status => {
    if (status === 'matched') {return 'check-circle';}
    if (status === 'failed') {return 'close-circle';}
    return 'alert-circle';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>

      {/* ── Header Banner ── */}
      <View style={styles.headerBanner}>
        <View style={styles.headerLeft}>
          <Icon name="shield-check" size={36} color="#fff" />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>SecureFace</Text>
            <Text style={styles.headerSubtitle}>NHAI Attendance System</Text>
          </View>
        </View>
        <View style={styles.headerBadge}>
          <Icon name="wifi-off" size={14} color="#fff" />
          <Text style={styles.headerBadgeText}>OFFLINE</Text>
        </View>
      </View>

      {/* ── Stats Row ── */}
      <Text style={styles.sectionTitle}>Overview</Text>
      <StatCard
        icon="account-group"
        label="Enrolled Personnel"
        value={stats.enrolledCount}
        color={COLORS.primary}
        bgColor={COLORS.infoLight}
      />
      <StatCard
        icon="clipboard-check"
        label="Total Attendance"
        value={stats.totalAttendance}
        color={COLORS.success}
        bgColor={COLORS.successLight}
      />
      <StatCard
        icon="cloud-upload"
        label="Pending Sync"
        value={stats.pendingSync}
        color={stats.pendingSync > 0 ? COLORS.warning : COLORS.success}
        bgColor={stats.pendingSync > 0 ? COLORS.warningLight : COLORS.successLight}
      />

      {lastSync && (
        <Text style={styles.lastSyncText}>
          Last sync: {moment(lastSync).fromNow()}
        </Text>
      )}

      {/* ── Quick Actions ── */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActionsRow}>
        <QuickAction
          icon="account-plus"
          label="Enroll"
          color={COLORS.primary}
          onPress={() => navigation.navigate('Enroll')}
        />
        <QuickAction
          icon="face-recognition"
          label="Attendance"
          color={COLORS.success}
          onPress={() => navigation.navigate('Attendance')}
        />
        <QuickAction
          icon="clipboard-list"
          label="Logs"
          color={COLORS.secondary}
          onPress={() => navigation.navigate('Logs')}
        />
        <QuickAction
          icon="cog"
          label="Settings"
          color={COLORS.textSecondary}
          onPress={() => navigation.navigate('Settings')}
        />
      </View>

      {/* ── Recent Activity ── */}
      <Text style={styles.sectionTitle}>Recent Activity</Text>
      {recentLogs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Icon name="clipboard-outline" size={36} color={COLORS.textDisabled} />
          <Text style={styles.emptyText}>No attendance records yet</Text>
        </View>
      ) : (
        recentLogs.map(log => (
          <View key={log.id} style={styles.logCard}>
            <Icon
              name={getStatusIcon(log.status)}
              size={22}
              color={getStatusColor(log.status)}
              style={styles.logIcon}
            />
            <View style={styles.logBody}>
              <Text style={styles.logName}>{log.personnel_name || 'Unknown'}</Text>
              <Text style={styles.logMeta}>
                {moment(log.timestamp).format('DD MMM YYYY, HH:mm:ss')}
              </Text>
            </View>
            <View
              style={[
                styles.logBadge,
                {backgroundColor: getStatusColor(log.status) + '22'},
              ]}>
              <Text
                style={[styles.logBadgeText, {color: getStatusColor(log.status)}]}>
                {log.status.toUpperCase().replace('_', ' ')}
              </Text>
            </View>
          </View>
        ))
      )}
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
  headerBanner: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    marginLeft: SPACING.sm,
  },
  headerTitle: {
    color: '#fff',
    fontSize: FONT_SIZES['2xl'],
    ...FONTS.bold,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: FONT_SIZES.sm,
    ...FONTS.regular,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: FONT_SIZES.xs,
    ...FONTS.bold,
    marginLeft: 4,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  statCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
    ...SHADOWS.sm,
  },
  statIconWrap: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statContent: {
    marginLeft: SPACING.md,
  },
  statValue: {
    fontSize: FONT_SIZES['2xl'],
    ...FONTS.bold,
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    ...FONTS.regular,
  },
  lastSyncText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'right',
    marginTop: -SPACING.xs,
    marginBottom: SPACING.sm,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  quickAction: {
    alignItems: 'center',
  },
  qaIconWrap: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  qaLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    ...FONTS.medium,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.base,
    marginTop: SPACING.sm,
  },
  logCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  logIcon: {
    marginRight: SPACING.sm,
  },
  logBody: {
    flex: 1,
  },
  logName: {
    fontSize: FONT_SIZES.base,
    ...FONTS.medium,
    color: COLORS.text,
  },
  logMeta: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  logBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  logBadgeText: {
    fontSize: FONT_SIZES.xs,
    ...FONTS.bold,
  },
});

export default HomeScreen;
