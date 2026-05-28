/**
 * LivenessChallengeBar.js
 * Visual challenge progress indicator shown during liveness check.
 * Shows challenge icon, instruction text, countdown timer, and progress.
 */

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, Animated} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING, RADIUS, FONT_SIZES, FONTS} from '../utils/theme';
import {LIVENESS_CHALLENGES} from '../modules/LivenessModule';

// Map challenges to icons
const CHALLENGE_ICONS = {
  [LIVENESS_CHALLENGES.BLINK]: 'eye',
  [LIVENESS_CHALLENGES.SMILE]: 'emoticon-happy',
  [LIVENESS_CHALLENGES.HEAD_TURN_LEFT]: 'arrow-left-bold',
  [LIVENESS_CHALLENGES.HEAD_TURN_RIGHT]: 'arrow-right-bold',
};

const TIMEOUT_SECONDS = 15;

/**
 * @param {string}   challenge     - Current liveness challenge key
 * @param {number}   progress      - 0–1 progress of completed challenges
 * @param {string}   instruction   - Human-readable challenge instruction
 * @param {boolean}  active        - Whether the liveness phase is active
 */
const LivenessChallengeBar = ({challenge, progress, instruction, active}) => {
  const [timeLeft, setTimeLeft] = useState(TIMEOUT_SECONDS);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  // Countdown timer
  useEffect(() => {
    if (!active) {return;}
    setTimeLeft(TIMEOUT_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [active, challenge]);

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const timerColor =
    timeLeft > 8 ? COLORS.success : timeLeft > 4 ? COLORS.warning : COLORS.error;

  if (!active) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Challenge icon + instruction */}
      <View style={styles.topRow}>
        <View style={styles.iconCircle}>
          <Icon
            name={CHALLENGE_ICONS[challenge] || 'help-circle'}
            size={24}
            color={COLORS.secondary}
          />
        </View>
        <Text style={styles.instruction} numberOfLines={2}>
          {instruction}
        </Text>
        {/* Countdown */}
        <View style={[styles.timer, {borderColor: timerColor}]}>
          <Text style={[styles.timerText, {color: timerColor}]}>{timeLeft}s</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View
          style={[styles.progressFill, {width: progressWidth}]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    margin: SPACING.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.secondary + '33',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.secondary,
  },
  instruction: {
    flex: 1,
    color: '#fff',
    fontSize: FONT_SIZES.sm,
    ...FONTS.medium,
    lineHeight: 20,
  },
  timer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  timerText: {
    fontSize: FONT_SIZES.sm,
    ...FONTS.bold,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.secondary,
    borderRadius: 3,
  },
});

export default LivenessChallengeBar;
