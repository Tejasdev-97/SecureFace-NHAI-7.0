/**
 * FaceGuideOverlay.js
 * Reusable camera overlay with face guide oval and status indicator.
 * Used by both CameraEnrollScreen and CameraAttendanceScreen.
 */

import React, {useEffect, useRef} from 'react';
import {View, Text, StyleSheet, Animated, Dimensions} from 'react-native';
import {COLORS, FONT_SIZES, FONTS, SPACING, RADIUS} from '../utils/theme';

const {width: SCREEN_W} = Dimensions.get('window');
const GUIDE_W = SCREEN_W * 0.65;
const GUIDE_H = GUIDE_W * 1.3;

/**
 * @param {boolean} faceDetected - Whether a face is currently in frame
 * @param {boolean} livenessActive - Highlight orange during liveness phase
 * @param {string}  instruction   - Text to show below the oval
 */
const FaceGuideOverlay = ({faceDetected, livenessActive, instruction}) => {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (faceDetected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {toValue: 1, duration: 800, useNativeDriver: false}),
          Animated.timing(glowAnim, {toValue: 0, duration: 800, useNativeDriver: false}),
        ]),
      ).start();
    } else {
      glowAnim.stopAnimation();
      glowAnim.setValue(0);
    }
  }, [faceDetected, glowAnim]);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: livenessActive
      ? [COLORS.secondary, COLORS.secondaryLight]
      : faceDetected
      ? [COLORS.success, '#66BB6A']
      : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.5)'],
  });

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View
        style={[
          styles.guideOval,
          {
            borderColor,
            borderWidth: faceDetected ? 3 : 2,
            borderStyle: faceDetected ? 'solid' : 'dashed',
          },
        ]}
      />
      {/* Corner markers */}
      <View style={styles.cornerTL} />
      <View style={styles.cornerTR} />
      <View style={styles.cornerBL} />
      <View style={styles.cornerBR} />

      {instruction ? (
        <View style={styles.instructionBubble}>
          <Text style={styles.instructionText}>{instruction}</Text>
        </View>
      ) : null}
    </View>
  );
};

const CORNER_SIZE = 20;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideOval: {
    width: GUIDE_W,
    height: GUIDE_H,
    borderRadius: GUIDE_W / 1.6,
  },
  // Corner accent marks
  cornerTL: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -(GUIDE_H / 2 + CORNER_SIZE / 2),
    marginLeft: -(GUIDE_W / 2 + CORNER_SIZE / 2),
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: COLORS.primary,
  },
  cornerTR: {
    position: 'absolute',
    top: '50%',
    right: '50%',
    marginTop: -(GUIDE_H / 2 + CORNER_SIZE / 2),
    marginRight: -(GUIDE_W / 2 + CORNER_SIZE / 2),
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: COLORS.primary,
  },
  cornerBL: {
    position: 'absolute',
    bottom: '50%',
    left: '50%',
    marginBottom: -(GUIDE_H / 2 + CORNER_SIZE / 2),
    marginLeft: -(GUIDE_W / 2 + CORNER_SIZE / 2),
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: COLORS.primary,
  },
  cornerBR: {
    position: 'absolute',
    bottom: '50%',
    right: '50%',
    marginBottom: -(GUIDE_H / 2 + CORNER_SIZE / 2),
    marginRight: -(GUIDE_W / 2 + CORNER_SIZE / 2),
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: COLORS.primary,
  },
  instructionBubble: {
    position: 'absolute',
    bottom: '15%',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  instructionText: {
    color: '#fff',
    fontSize: FONT_SIZES.base,
    ...FONTS.medium,
    textAlign: 'center',
  },
});

export default FaceGuideOverlay;
