/**
 * LogsScreen.js
 * Attendance logs with filter, search, and sync status
 */

import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING, RADIUS, SHADOWS, FONT_SIZES, FONTS} from '../utils/theme';
import {DatabaseService} from '../modules/DatabaseService';
import {SyncManager} from '../modules/SyncManager';
import moment from 'moment';

const FILTER_ALL = 'all';
const FILTER_MATCHED = 'matched';
const FILTER_FAILED = 'failed';
const FILTER_PENDING = 'pending';

const LogsScreen = () => {
  const [logs, setLogs] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState(FILTER_ALL);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const all = await DatabaseService.getAllAttendance(200);
      const pending = all.filter(l => l.synced === 0).length;
      setLogs(all);
      setPendingCount(pending);
    } catch (err) {
      console.error('[Logs] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLogs();
    }, [loadLogs]),
  );

  React.useEffect(() => {
    applyFilter(logs, activeFilter, search);
  }, [logs, activeFilter, search]);

  const applyFilter = (data, filter, query) => {
    let result = data;
    if (filter === FILTER_MATCHED) {
      result = result.filter(l => l.status === 'matched');
    } else if (filter === FILTER_FAILED) {
      result = result.filter(
        l => l.status === 'failed' || l.status === 'liveness_failed',
      );
    } else if (filter === FILTER_PENDING) {
      result = result.filter(l => l.synced === 0);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        l =>
          (l.personnel_name || '').toLowerCase().includes(q) ||
          (l.personnel_id || '').toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  };

  const handleFilterChange = f => {
    setActiveFilter(f);
    applyFilter(logs, f, search);
  };

  const handleSearch = q => {
    setSearch(q);
    applyFilter(logs, activeFilter, q);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await SyncManager.syncNow(true); // demoMode=true for hackathon
      Alert.alert(
        result.success ? 'Sync Complete' : 'Sync Failed',
        result.success
          ? `${result.syncedCount} records synced successfully.`
          : result.error || 'Unknown error occurred.',
      );
      loadLogs();
    } catch (err) {
      Alert.alert('Sync Error', err.message);
    } finally {
      setSyncing(false);
    }
  };

  const getStatusColor = status => {
    if (status === 'matched') {return COLORS.success;}
    if (status === 'failed' || status === 'liveness_failed') {return COLORS.error;}
    return COLORS.warning;
  };

  const getStatusIcon = status => {
    if (status === 'matched') {return 'check-circle';}
    if (status === 'liveness_failed') {return 'eye-off-outline';}
    return 'close-circle';
  };

  // ── Row renderer ──
  const renderLog = ({item}) => (
    <View style={styles.logCard}>
      <Icon
        name={getStatusIcon(item.status)}
        size={24}
        color={getStatusColor(item.status)}
        style={styles.logIcon}
      />
      <View style={styles.logBody}>
        <View style={styles.logRow}>
          <Text style={styles.logName} numberOfLines={1}>
            {item.personnel_name || 'Unknown'}
          </Text>
          {item.personnel_id && (
            <Text style={styles.logId}>#{item.personnel_id}</Text>
          )}
        </View>
        <Text style={styles.logTime}>
          {moment(item.timestamp).format('DD MMM YYYY, HH:mm:ss')}
        </Text>
        <View style={styles.logTagRow}>
          <View
            style={[
              styles.statusTag,
              {backgroundColor: getStatusColor(item.status) + '22'},
            ]}>
            <Text
              style={[styles.statusTagText, {color: getStatusColor(item.status)}]}>
              {item.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
          {item.confidence > 0 && (
            <Text style={styles.confText}>
              {(item.confidence * 100).toFixed(1)}%
            </Text>
          )}
          <View
            style={[
              styles.syncTag,
              {backgroundColor: item.synced ? COLORS.successLight : COLORS.warningLight},
            ]}>
            <Icon
              name={item.synced ? 'cloud-check' : 'cloud-upload'}
              size={12}
              color={item.synced ? COLORS.success : COLORS.warning}
            />
            <Text
              style={[
                styles.syncTagText,
                {color: item.synced ? COLORS.success : COLORS.warning},
              ]}>
              {item.synced ? 'Synced' : 'Pending'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* ── Search bar ── */}
      <View style={styles.searchBar}>
        <Icon name="magnify" size={20} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or ID..."
          value={search}
          onChangeText={handleSearch}
          placeholderTextColor={COLORS.textDisabled}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Icon name="close-circle" size={18} color={COLORS.textDisabled} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filter chips ── */}
      <View style={styles.filterRow}>
        {[
          {key: FILTER_ALL, label: 'All'},
          {key: FILTER_MATCHED, label: '✓ Matched'},
          {key: FILTER_FAILED, label: '✗ Failed'},
          {key: FILTER_PENDING, label: `⏳ Pending (${pendingCount})`},
        ].map(({key, label}) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, activeFilter === key && styles.chipActive]}
            onPress={() => handleFilterChange(key)}>
            <Text
              style={[
                styles.chipText,
                activeFilter === key && styles.chipTextActive,
              ]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Sync Button ── */}
      {pendingCount > 0 && (
        <TouchableOpacity
          style={styles.syncBtn}
          onPress={handleSync}
          disabled={syncing}
          activeOpacity={0.85}>
          {syncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="cloud-upload" size={18} color="#fff" />
              <Text style={styles.syncBtnText}>
                Sync {pendingCount} Pending Records
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* ── List ── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading records...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderLog}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Icon name="clipboard-outline" size={48} color={COLORS.textDisabled} />
              <Text style={styles.emptyText}>No records found</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    margin: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: FONT_SIZES.base,
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  chip: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    ...FONTS.medium,
  },
  chipTextActive: {color: '#fff'},
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  syncBtnText: {
    color: '#fff',
    fontSize: FONT_SIZES.sm,
    ...FONTS.bold,
    marginLeft: SPACING.sm,
  },
  listContent: {padding: SPACING.md, paddingTop: 0, paddingBottom: SPACING.xl},
  logCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  logIcon: {marginRight: SPACING.sm, marginTop: 2},
  logBody: {flex: 1},
  logRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 2},
  logName: {
    flex: 1,
    fontSize: FONT_SIZES.base,
    ...FONTS.medium,
    color: COLORS.text,
  },
  logId: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  logTime: {fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginBottom: SPACING.xs},
  logTagRow: {flexDirection: 'row', alignItems: 'center', gap: SPACING.xs},
  statusTag: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  statusTagText: {fontSize: FONT_SIZES.xs, ...FONTS.bold},
  confText: {fontSize: FONT_SIZES.xs, color: COLORS.textSecondary},
  syncTag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  syncTagText: {fontSize: FONT_SIZES.xs, marginLeft: 3, ...FONTS.medium},
  loadingWrap: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  loadingText: {color: COLORS.textSecondary, marginTop: SPACING.sm},
  emptyWrap: {alignItems: 'center', paddingTop: SPACING['2xl']},
  emptyText: {color: COLORS.textSecondary, marginTop: SPACING.md, fontSize: FONT_SIZES.base},
});

export default LogsScreen;
