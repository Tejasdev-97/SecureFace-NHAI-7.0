/**
 * CameraAttendanceScreen.js
 * Live face verification screen — timer-based liveness (reliable on all real devices).
 *
 * Pipeline:
 *   Phase 1 — READY:       Camera opens, user sees their face, taps "Start"
 *   Phase 2 — LIVENESS:    Random challenge shown, 4-second countdown timer
 *   Phase 3 — RECOGNIZING: Capture photo → extract embedding → compare
 *   Phase 4 — RESULT:      Show matched / not-matched card
 *
 * Why timer-based?
 *   react-native-camera's onFacesDetected relies on Google ML Kit face detection
 *   which requires specific camera session config. On many real devices (especially
 *   Xiaomi MIUI) this causes a native crash within 1 second of camera opening.
 *   Timer-based liveness avoids all of that: the user just performs the action
 *   and taps confirm, which is equally valid for a hackathon demo.
 */

import React, {useRef, useState, useCallback, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import {RNCamera} from 'react-native-camera';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RNFS from 'react-native-fs';
import FaceDetection from '@react-native-ml-kit/face-detection';
import { useIsFocused } from '@react-navigation/native';

import {COLORS, SPACING, RADIUS, FONT_SIZES, FONTS, SHADOWS} from '../utils/theme';
import {FaceRecognitionModule} from '../modules/FaceRecognitionModule';
import {DatabaseService} from '../modules/DatabaseService';
import {BiometricEngine} from '../modules/BiometricEngine';
import {generateUniqueId} from '../utils/helpers';
import moment from 'moment';

const {width: SCREEN_W} = Dimensions.get('window');
const GUIDE_SIZE = SCREEN_W * 0.65;
const LIVENESS_DURATION_MS = 6000; // 6 seconds for liveness challenge

// ── Phase Constants ─────────────────────────────────────────────────────────
const PHASE = {
  READY: 'READY',
  LIVENESS: 'LIVENESS',
  RECOGNIZING: 'RECOGNIZING',
  RESULT: 'RESULT',
};

// ── Challenges ───────────────────────────────────────────────────────────────
const CHALLENGES = [
  {key: 'BLINK',    icon: 'eye',             text: '👁  Please BLINK your eyes slowly'},
  {key: 'SMILE',    icon: 'emoticon-happy',  text: '😊  Please SMILE naturally'},
  {key: 'TURN_L',   icon: 'arrow-left',      text: '⬅️  Turn your head slightly LEFT'},
  {key: 'TURN_R',   icon: 'arrow-right',     text: '➡️  Turn your head slightly RIGHT'},
  {key: 'NOD',      icon: 'arrow-down',      text: '⬇️  Slowly NOD your head once'},
];

function pickChallenge() {
  return CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
}

function evaluateLiveness(challengeKey, face, imgWidth, imgHeight) {
  if (!face) return false;

  let yaw = face.rotationY || face.headEulerAngleY || 0;
  let pitch = face.rotationX || face.headEulerAngleX || 0;
  const isLandscape = imgWidth && imgHeight && imgWidth > imgHeight;

  // Swap yaw and pitch since the camera sensor is rotated 90 degrees in landscape images
  if (isLandscape) {
    const temp = yaw;
    yaw = pitch;
    pitch = temp;
  }

  switch (challengeKey) {
    case 'BLINK': {
      const leftOpen = face.leftEyeOpenProbability !== undefined ? face.leftEyeOpenProbability : 1.0;
      const rightOpen = face.rightEyeOpenProbability !== undefined ? face.rightEyeOpenProbability : 1.0;
      return leftOpen < 0.25 || rightOpen < 0.25;
    }
    case 'SMILE': {
      return face.smilingProbability !== undefined && face.smilingProbability > 0.70;
    }
    case 'TURN_L': {
      if (isLandscape) {
        return Math.abs(yaw) > 18;
      }
      return yaw < -18;
    }
    case 'TURN_R': {
      if (isLandscape) {
        return Math.abs(yaw) > 18;
      }
      return yaw > 18;
    }
    case 'NOD': {
      return Math.abs(pitch) > 15;
    }
    default:
      return false;
  }
}

// ─── CameraAttendanceScreen ──────────────────────────────────────────────────

const CameraAttendanceScreen = ({navigation}) => {
  const cameraRef = useRef(null);
  const timerRef = useRef(null);
  const isProcessingRef = useRef(false);
  const isFocused = useIsFocused();
  const alignmentStartRef = useRef(null);
  const isCheckingRef = useRef(false);

  const [phase, setPhase] = useState(PHASE.READY);
  const [challenge, setChallenge] = useState(null);
  const [countdown, setCountdown] = useState(6);
  const [result, setResult] = useState(null);
  const [cameraType, setCameraType] = useState(RNCamera.Constants.Type.front);
  const [cameraReady, setCameraReady] = useState(false);

  // Alignment states
  const [faceAlignment, setFaceAlignment] = useState('unaligned');
  const [alignmentReason, setAlignmentReason] = useState('Position face inside oval');

  // Animated values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const livenessSuccessRef = useRef(false);
  const activePhaseRef = useRef(PHASE.READY);

  useEffect(() => {
    activePhaseRef.current = phase;
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startNewSession = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isProcessingRef.current = false;
    livenessSuccessRef.current = false;
    setPhase(PHASE.READY);
    setChallenge(null);
    setCountdown(6);
    setResult(null);
    setFaceAlignment('unaligned');
    setAlignmentReason('Position face inside oval');
    alignmentStartRef.current = null;
    progressAnim.setValue(0);
  }, [progressAnim]);

  // ── Face recognition ──
  const runRecognition = useCallback(async () => {
    if (isProcessingRef.current) {
      return;
    }
    isProcessingRef.current = true;
    setPhase(PHASE.RECOGNIZING);

    // 1. Wait for any active background alignment/liveness check capture to finish completely
    while (isCheckingRef.current) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 2. Sleep 400ms to let the camera sensor/driver settle and clear hardware locks
    await new Promise(resolve => setTimeout(resolve, 400));

    let capturedUri = null;
    try {
      if (!cameraRef.current) {
        throw new Error('Camera not available');
      }
      const data = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        fixOrientation: true,
        mirrorImage: false,
        playSoundOnCapture: true,
      });

      if (!data || !data.uri) {
        throw new Error('Failed to capture image');
      }
      capturedUri = data.uri;

      const recResult = await FaceRecognitionModule.recognizeFace(capturedUri);

      await saveAndShowResult({
        matched: recResult.matched,
        status: recResult.matched ? 'matched' : 'failed',
        personnel_id: recResult.personnel_id || recResult.closest_personnel_id,
        name: recResult.name || recResult.closest_name,
        confidence: recResult.confidence,
        livenessOk: true,
      });
    } catch (err) {
      console.error('[CameraAttendance] Recognition error:', err);
      await saveAndShowResult({
        matched: false,
        status: 'failed',
        personnel_id: null,
        name: null,
        confidence: 0,
        livenessOk: true,
      });
    } finally {
      if (capturedUri) {
        try {
          await RNFS.unlink(capturedUri.replace(/^file:\/+/i, '/'));
        } catch (e) {}
      }
    }
  }, []);

  // ── Save result to DB ──
  const saveAndShowResult = async ({
    matched, status, personnel_id, name, confidence, livenessOk,
  }) => {
    const id = generateUniqueId('att');
    try {
      await DatabaseService.insertAttendance({
        id,
        personnel_id: matched ? personnel_id : null,
        personnel_name: matched ? name : null,
        confidence,
        status,
        liveness_passed: livenessOk,
      });
    } catch (err) {
      console.error('[CameraAttendance] Save error:', err);
    }

    setPhase(PHASE.RESULT);
    setResult({
      matched,
      status,
      name,
      personnel_id,
      confidence,
      timestamp: new Date(),
      livenessFailed: !livenessOk,
    });

    // Pulse animation
    Animated.sequence([
      Animated.timing(pulseAnim, {toValue: 1.08, duration: 200, useNativeDriver: true}),
      Animated.timing(pulseAnim, {toValue: 1, duration: 200, useNativeDriver: true}),
    ]).start();
  };

  // ── Start liveness challenge ──
  const startLiveness = useCallback(() => {
    if (!cameraReady) {
      Alert.alert('Camera not ready', 'Please wait for the camera to initialize.');
      return;
    }
    const picked = pickChallenge();
    setChallenge(picked);
    setPhase(PHASE.LIVENESS);
    setCountdown(6);
    progressAnim.setValue(0);
    livenessSuccessRef.current = false;

    // Animate progress bar
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: LIVENESS_DURATION_MS,
      useNativeDriver: false,
    }).start();

    // Count down
    let remaining = 6;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        
        // If countdown expires and liveness didn't succeed, fail immediately!
        if (!livenessSuccessRef.current) {
          saveAndShowResult({
            matched: false,
            status: 'failed',
            personnel_id: null,
            name: null,
            confidence: 0,
            livenessOk: false,
          });
        }
      }
    }, 1000);
  }, [cameraReady, progressAnim]);

  // ── Background Alignment & Liveness Checking Loop ──
  useEffect(() => {
    let intervalId = null;

    const loop = async () => {
      const currentPhase = activePhaseRef.current;
      if (!cameraReady || isCheckingRef.current || !cameraRef.current || !isFocused || isProcessingRef.current) {
        return;
      }
      if (currentPhase !== PHASE.READY && currentPhase !== PHASE.LIVENESS) {
        return;
      }

      isCheckingRef.current = true;
      let tempPath = null;
      try {
        const options = {
          quality: 0.15,
          width: 320,
          fixOrientation: true,
          mirrorImage: false,
          playSoundOnCapture: false,
        };
        const data = await cameraRef.current.takePictureAsync(options);
        if (data && data.uri) {
          tempPath = data.uri;

          // Check focus state again
          if (!isFocused) {
            return;
          }

          // Normalize file path to always use file:/// scheme
          const fileUri = 'file:///' + tempPath.replace(/^file:\/+/i, '');

          // Run face detection on snapshot with lowered minFaceSize for distant detection
          const faces = await FaceDetection.detect(fileUri, {
            performanceMode: 'fast',
            landmarkMode: 'none',
            classificationMode: currentPhase === PHASE.LIVENESS ? 'all' : 'none',
            minFaceSize: 0.08,
          });

          // Check if phase changed while taking photo
          const freshPhase = activePhaseRef.current;
          if (freshPhase !== PHASE.READY && freshPhase !== PHASE.LIVENESS) {
            return;
          }

          if (!faces || faces.length !== 1) {
            setFaceAlignment('unaligned');
            alignmentStartRef.current = null;
            setAlignmentReason(faces && faces.length > 1 ? 'Multiple faces detected' : 'Align face inside oval');
          } else {
            const face = faces[0];
            const imgWidth = data.width || 360;
            const imgHeight = data.height || 640;

            if (freshPhase === PHASE.READY) {
              const res = BiometricEngine.checkFaceAlignment(face, imgWidth, imgHeight);
              if (res.aligned) {
                setFaceAlignment('aligned');
                setAlignmentReason('Perfect! Ready to start.');
              } else {
                setFaceAlignment('unaligned');
                alignmentStartRef.current = null;
                setAlignmentReason(res.reason);
              }
            } else if (freshPhase === PHASE.LIVENESS && challenge) {
              const passed = evaluateLiveness(challenge.key, face, imgWidth, imgHeight);
              if (passed && !livenessSuccessRef.current) {
                livenessSuccessRef.current = true;
                
                // Clear liveness countdown timer
                if (timerRef.current) {
                  clearInterval(timerRef.current);
                  timerRef.current = null;
                }
                
                // Proceed directly to face recognition!
                runRecognition();
              }
            }
          }
        }
      } catch (err) {
        console.warn('[AttendanceLoop] Error:', err);
      } finally {
        isCheckingRef.current = false;
        if (tempPath) {
          try {
            await RNFS.unlink(tempPath.replace(/^file:\/+/i, '/'));
          } catch (e) {}
        }
      }
    };

    if (cameraReady && isFocused) {
      intervalId = setInterval(loop, 1500);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [cameraReady, challenge, runRecognition, isFocused]);

  const toggleCamera = useCallback(() => {
    setCameraType(prev =>
      prev === RNCamera.Constants.Type.back
        ? RNCamera.Constants.Type.front
        : RNCamera.Constants.Type.back,
    );
  }, []);

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
  }, []);

  const handleCameraError = useCallback(err => {
    console.warn('[CameraAttendance] Mount error:', err);
    Alert.alert(
      'Camera Error',
      'Could not open camera. Try tapping the flip button (🔄) to switch cameras.',
      [{text: 'OK'}],
    );
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  // ── RESULT SCREEN ──
  // ────────────────────────────────────────────────────────────────────────────
  if (phase === PHASE.RESULT && result) {
    const isMatch = result.matched;

    return (
      <View style={styles.resultContainer}>
        <Animated.View
          style={[
            styles.resultCard,
            {transform: [{scale: pulseAnim}]},
            isMatch ? styles.resultCardSuccess : styles.resultCardFail,
          ]}>
          <Icon
            name={isMatch ? 'check-circle' : 'close-circle'}
            size={80}
            color={isMatch ? COLORS.success : COLORS.error}
          />
          <Text style={[styles.resultTitle, {color: isMatch ? COLORS.success : COLORS.error}]}>
            {isMatch ? 'Access Granted' : 'Not Recognized'}
          </Text>

          {isMatch && (
            <>
              <Text style={styles.resultName}>{result.name}</Text>
              <Text style={styles.resultConf}>
                Confidence: {(result.confidence * 100).toFixed(1)}%
              </Text>
            </>
          )}

          {!isMatch && (
            <>
              <Text style={styles.resultMsg}>
                {result.livenessFailed
                  ? 'Liveness verification failed. Please blink, smile, or turn your head as prompted.'
                  : 'Identity verification failed.'}
              </Text>
              {!result.livenessFailed && (
                result.name ? (
                  <View style={styles.closestMatchBox}>
                    <Text style={styles.closestMatchLabel}>Closest registered person:</Text>
                    <Text style={styles.closestMatchName}>{result.name} (ID: {result.personnel_id})</Text>
                    <Text style={styles.closestMatchScore}>Match Score: {(result.confidence * 100).toFixed(1)}%</Text>
                    <Text style={styles.thresholdInfo}>Required threshold: 82.0%</Text>
                  </View>
                ) : (
                  <Text style={styles.resultMsg}>No enrolled faces found in local database.</Text>
                )
              )}
            </>
          )}

          <Text style={styles.resultTime}>
            {moment(result.timestamp).format('DD MMM YYYY, HH:mm:ss')}
          </Text>

          <TouchableOpacity
            style={[styles.retryBtn, {borderColor: isMatch ? COLORS.success : COLORS.primary}]}
            onPress={startNewSession}
            activeOpacity={0.8}>
            <Icon name="refresh" size={18} color={isMatch ? COLORS.success : COLORS.primary} />
            <Text style={[styles.retryText, {color: isMatch ? COLORS.success : COLORS.primary}]}>
              Verify Another
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ── CAMERA SCREEN ──
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <RNCamera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        type={cameraType}
        captureAudio={false}
        onCameraReady={handleCameraReady}
        onMountError={handleCameraError}
        androidCameraPermissionOptions={{
          title: 'Camera Permission',
          message: 'SecureFace needs camera access for identity verification.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }}
        notAuthorizedView={
          <View style={styles.noPermission}>
            <Icon name="camera-off" size={48} color={COLORS.error} />
            <Text style={styles.noPermissionText}>
              Camera permission required. Enable in device Settings.
            </Text>
          </View>
        }
      />

      {/* ── Camera Flip Button ── */}
      <TouchableOpacity
        style={styles.flipBtn}
        onPress={toggleCamera}
        activeOpacity={0.8}>
        <Icon name="camera-flip" size={24} color="#fff" />
      </TouchableOpacity>

      {/* ── Face Guide Oval ── */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.guideWrap}>
          <View
            style={[
              styles.guideOval,
              phase === PHASE.READY && (faceAlignment === 'aligned' ? styles.guideOvalAligned : styles.guideOvalUnaligned),
              phase === PHASE.LIVENESS && styles.guideOvalLiveness,
              phase === PHASE.RECOGNIZING && styles.guideOvalRecognizing,
            ]}
          />
        </View>
      </View>

      {/* ── Top Bar ── */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Identity Verification</Text>
        <View
          style={[
            styles.phasePill,
            phase === PHASE.LIVENESS && styles.phasePillLiveness,
            phase === PHASE.RECOGNIZING && styles.phasePillRecognizing,
          ]}>
          <Text style={styles.phasePillText}>
            {phase === PHASE.READY && '● Align Your Face'}
            {phase === PHASE.LIVENESS && '● Liveness Check'}
            {phase === PHASE.RECOGNIZING && '● Recognizing...'}
          </Text>
        </View>
      </View>

      {/* ── Bottom Panel ── */}
      <View style={styles.bottomPanel}>
        {/* Progress bar during liveness */}
        {phase === PHASE.LIVENESS && (
          <View style={styles.progressBarWrap}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                     inputRange: [0, 1],
                     outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        )}

        {/* Instructions */}
        <Text style={styles.instructionText}>
          {phase === PHASE.READY &&
            (cameraReady
              ? alignmentReason
              : 'Camera initializing...')}
          {phase === PHASE.LIVENESS && challenge
            ? `${challenge.text}  (${countdown}s)`
            : ''}
          {phase === PHASE.RECOGNIZING && '🔍  Comparing face — please hold still...'}
        </Text>

        {/* Action button */}
        {phase === PHASE.READY && (
          <TouchableOpacity
            style={[
              styles.actionBtn,
              (faceAlignment !== 'aligned' || !cameraReady) && styles.actionBtnDisabled,
            ]}
            onPress={startLiveness}
            disabled={faceAlignment !== 'aligned' || !cameraReady}
            activeOpacity={0.85}
            testID="btn-start-liveness">
            <Icon name="play-circle" size={22} color="#fff" />
            <Text style={styles.actionBtnText}>Start Liveness Check</Text>
          </TouchableOpacity>
        )}

        {phase === PHASE.LIVENESS && challenge && (
          <View style={styles.challengeIconWrap}>
            <Icon name={challenge.icon} size={36} color={COLORS.secondary} />
          </View>
        )}

        {phase === PHASE.RECOGNIZING && (
          <View style={styles.recognizingWrap}>
            <Icon name="radar" size={36} color={COLORS.primary} />
          </View>
        )}
      </View>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  flipBtn: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 24,
    padding: 10,
    zIndex: 10,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideWrap: {alignItems: 'center', justifyContent: 'center'},
  guideOval: {
    width: GUIDE_SIZE,
    height: GUIDE_SIZE * 1.3,
    borderRadius: GUIDE_SIZE / 1.6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderStyle: 'dashed',
  },
  guideOvalAligned: {
    borderColor: COLORS.success,
    borderStyle: 'dashed',
    borderWidth: 3,
  },
  guideOvalUnaligned: {
    borderColor: COLORS.error,
    borderStyle: 'dashed',
    borderWidth: 3,
  },
  guideOvalLiveness: {
    borderColor: COLORS.secondary,
    borderStyle: 'solid',
    borderWidth: 3,
  },
  guideOvalRecognizing: {
    borderColor: COLORS.primary,
    borderStyle: 'solid',
    borderWidth: 3,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: SPACING.md,
    alignItems: 'center',
  },
  topBarTitle: {
    color: '#fff',
    fontSize: FONT_SIZES.lg,
    ...FONTS.bold,
    marginBottom: 6,
  },
  phasePill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  phasePillLiveness: {backgroundColor: COLORS.secondary + 'CC'},
  phasePillRecognizing: {backgroundColor: COLORS.primary + 'CC'},
  phasePillText: {
    color: '#fff',
    fontSize: FONT_SIZES.sm,
    ...FONTS.medium,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: SPACING.lg,
    alignItems: 'center',
    paddingBottom: SPACING.xl,
  },
  progressBarWrap: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.secondary,
    borderRadius: 3,
  },
  instructionText: {
    color: '#fff',
    fontSize: FONT_SIZES.base,
    textAlign: 'center',
    ...FONTS.medium,
    marginBottom: SPACING.md,
    lineHeight: 24,
  },
  actionBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  actionBtnDisabled: {opacity: 0.4},
  actionBtnText: {
    color: '#fff',
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    marginLeft: SPACING.sm,
  },
  challengeIconWrap: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 40,
    padding: SPACING.md,
  },
  recognizingWrap: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 40,
    padding: SPACING.md,
  },
  noPermission: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: '#000',
  },
  noPermissionText: {
    color: COLORS.error,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  // ── Result ──
  resultContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  resultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderTopWidth: 6,
    ...SHADOWS.lg,
  },
  resultCardSuccess: {borderTopColor: COLORS.success},
  resultCardFail: {borderTopColor: COLORS.error},
  resultTitle: {
    fontSize: FONT_SIZES['3xl'],
    ...FONTS.bold,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  resultName: {
    fontSize: FONT_SIZES['2xl'],
    ...FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  resultConf: {
    fontSize: FONT_SIZES.base,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  resultMsg: {
    fontSize: FONT_SIZES.base,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  resultTime: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textDisabled,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  retryText: {
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    marginLeft: SPACING.sm,
  },
  backBtn: {paddingVertical: SPACING.sm},
  backText: {color: COLORS.textSecondary, fontSize: FONT_SIZES.base},
  closestMatchBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    width: '100%',
    alignItems: 'center',
    marginVertical: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  closestMatchLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    ...FONTS.medium,
    marginBottom: 4,
  },
  closestMatchName: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    ...FONTS.bold,
  },
  closestMatchScore: {
    fontSize: FONT_SIZES.base,
    color: COLORS.error,
    ...FONTS.bold,
    marginTop: 2,
  },
  thresholdInfo: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textDisabled,
    ...FONTS.regular,
    marginTop: 4,
  },
});

export default CameraAttendanceScreen;
