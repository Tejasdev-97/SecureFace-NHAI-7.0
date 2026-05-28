/**
 * CameraEnrollScreen.js
 * Face capture screen for enrollment.
 *
 * Flow:
 *   1. Request camera permission
 *   2. Show live preview with face-guide oval
 *   3. Face detection feedback (bounding box guidance)
 *   4. Capture N frames → extract embeddings → store to SQLite
 *   5. Show success/error confirmation
 *
 * Uses react-native-camera with face detection enabled.
 */
import React, {useRef, useState, useCallback, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import {RNCamera} from 'react-native-camera';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RNFS from 'react-native-fs';
import FaceDetection from '@react-native-ml-kit/face-detection';
import { useIsFocused } from '@react-navigation/native';

import {COLORS, SPACING, RADIUS, FONT_SIZES, FONTS, SHADOWS} from '../utils/theme';
import {DatabaseService} from '../modules/DatabaseService';
import {FaceRecognitionModule} from '../modules/FaceRecognitionModule';
import {BiometricEngine} from '../modules/BiometricEngine';

const {width: SCREEN_W, height: SCREEN_H} = Dimensions.get('window');
const GUIDE_SIZE = SCREEN_W * 0.65;
const CAPTURES_REQUIRED = 3; // Capture 3 frames for robust enrollment

// ─── CameraEnrollScreen ───────────────────────────────────────────────────────

const CameraEnrollScreen = ({navigation, route}) => {
  const {personnelId, name} = route.params;
  const cameraRef = useRef(null);
  const isFocused = useIsFocused();

  const [cameraReady, setCameraReady] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('scanning'); // idle | scanning | saving | success | error
  const [enrollStep, setEnrollStep] = useState(1); // 0: idle, 1: Straight, 2: Left, 3: Right, 4: Saving
  
  // Default to front camera on real phone for selfie enrollment
  const [cameraType, setCameraType] = useState(RNCamera.Constants.Type.front);

  // Face alignment state
  const [faceAlignment, setFaceAlignment] = useState('unaligned'); // unaligned | aligned
  const [alignmentReason, setAlignmentReason] = useState('Position face inside oval');

  // Accumulate features and URIs for stable template averaging
  const capturedEmbeddingsRef = useRef([]);
  const capturedUrisRef = useRef([]);
  const alignmentStartRef = useRef(null);
  const enrollStepRef = useRef(0);

  useEffect(() => {
    enrollStepRef.current = enrollStep;
  }, [enrollStep]);

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
  }, []);

  const handleCameraError = useCallback((error) => {
    console.warn('[CameraEnroll] Camera mount error:', error);
    Alert.alert(
      'Camera Error',
      'Could not open camera. Try tapping 🔄 to switch cameras.',
      [{text: 'OK'}],
    );
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraReady(false); // Reset ready state on flip
    setCameraType(prev =>
      prev === RNCamera.Constants.Type.back
        ? RNCamera.Constants.Type.front
        : RNCamera.Constants.Type.back,
    );
  }, []);

  // Prevent concurrent captures
  const capturingRef = useRef(false);
  const alignmentActiveRef = useRef(false);
  const isCheckingRef = useRef(false);

  const startScanning = useCallback(() => {
    setFaceAlignment('unaligned');
    setAlignmentReason('Step 1 of 3: Look straight at camera');
    setEnrollStep(1);
    setCapturedCount(0);
    capturedEmbeddingsRef.current = [];
    capturedUrisRef.current = [];
    alignmentStartRef.current = null;
    setStatus('scanning');
  }, []);

  useEffect(() => {
    alignmentActiveRef.current = cameraReady && !processing && status === 'scanning' && isFocused;
  }, [cameraReady, processing, status, isFocused]);

  // ── Background Face Alignment Check Loop ──
  useEffect(() => {
    let intervalId = null;

    const checkAlignmentLoop = async () => {
      if (!alignmentActiveRef.current || isCheckingRef.current || !cameraRef.current || processingRef.current) {
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

          if (!alignmentActiveRef.current) {
            return;
          }

          // Normalize file path to always use file:/// scheme
          const fileUri = 'file:///' + tempPath.replace(/^file:\/+/i, '');

          // Run face detection on snapshot with lowered minFaceSize for distant detection
          const faces = await FaceDetection.detect(fileUri, {
            performanceMode: 'fast',
            landmarkMode: 'none',
            classificationMode: 'none',
            minFaceSize: 0.08,
          });

          if (!alignmentActiveRef.current) {
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

            const currentStep = enrollStepRef.current;
            let requiredPose = 'straight';
            if (currentStep === 2) {
              requiredPose = 'left';
            } else if (currentStep === 3) {
              requiredPose = 'right';
            }

            const res = BiometricEngine.checkFaceAlignment(face, imgWidth, imgHeight, requiredPose);
            if (res.aligned) {
              setFaceAlignment('aligned');
              setAlignmentReason('Face aligned! Ready to capture.');
            } else {
              setFaceAlignment('unaligned');
              alignmentStartRef.current = null;
              setAlignmentReason(res.reason);
            }
          }
        }
      } catch (err) {
        console.warn('[EnrollAlignment] Alignment check error:', err);
      } finally {
        isCheckingRef.current = false;
        if (tempPath) {
          try {
            await RNFS.unlink(tempPath.replace(/^file:\/+/i, '/'));
          } catch (e) {
            // Ignore delete failure
          }
        }
      }
    };

    if (cameraReady && isFocused) {
      intervalId = setInterval(checkAlignmentLoop, 1500);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [cameraReady, isFocused]);

  // ── Single capture for embedding ──
  const captureFrame = async () => {
    if (!cameraRef.current || capturingRef.current) {
      return null;
    }
    capturingRef.current = true;
    try {
      const options = {
        quality: 0.85,
        fixOrientation: true,
        mirrorImage: false,
        playSoundOnCapture: true,
      };
      const data = await cameraRef.current.takePictureAsync(options);
      return data.uri;
    } finally {
      capturingRef.current = false;
    }
  };

  const processingRef = useRef(false);

  // ── Capture and advance enrollment step ──
  const captureAndAdvanceStep = async (stepNum) => {
    if (processingRef.current) {
      return;
    }
    processingRef.current = true;
    setProcessing(true);
    console.log(`[CameraEnroll] Capturing high-quality photo for step ${stepNum}...`);

    try {
      // 1. Temporarily pause the background alignment check loop
      alignmentActiveRef.current = false;

      // 2. Wait for any active background alignment check capture to finish completely
      while (isCheckingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 3. Sleep 400ms to let the camera sensor/driver settle and clear hardware locks
      await new Promise(resolve => setTimeout(resolve, 400));

      const uri = await captureFrame();
      if (!uri) {
        throw new Error('Camera capture failed. Please hold still.');
      }

      const emb = await FaceRecognitionModule.extractEmbedding(uri);
      if (!emb) {
        throw new Error('Face features could not be extracted. Please look straight at the camera with good lighting.');
      }

      capturedEmbeddingsRef.current.push(emb);
      capturedUrisRef.current.push(uri);
      setCapturedCount(stepNum);

      if (stepNum < 3) {
        const nextStep = stepNum + 1;
        setEnrollStep(nextStep);
        setFaceAlignment('unaligned');
        if (nextStep === 2) {
          setAlignmentReason('Turn head slightly LEFT');
        } else if (nextStep === 3) {
          setAlignmentReason('Turn head slightly RIGHT');
        }
        processingRef.current = false;
        setProcessing(false);
      } else {
        setEnrollStep(4);
        await finalizeEnrollment(capturedEmbeddingsRef.current, capturedUrisRef.current);
      }
    } catch (err) {
      console.warn(`[CameraEnroll] Step ${stepNum} capture error:`, err);
      processingRef.current = false;
      setProcessing(false);
      Alert.alert(
        'Capture Failed',
        err.message || 'Face detection failed. Hold still and try again.',
        [{ text: 'Retry', onPress: () => {
          processingRef.current = false;
          setProcessing(false);
        }}]
      );
    }
  };

  // ── Finalize enrollment after 3 steps ──
  const finalizeEnrollment = async (embeddings, uris) => {
    setProcessing(true);
    setStatus('saving');

    try {
      // 1. Average features and check for duplicate registrations
      const avgEmbedding = BiometricEngine.averageFeatures(embeddings);
      const allEmbeddings = await FaceRecognitionModule.loadEmbeddings();
      const threshold = await FaceRecognitionModule.getThreshold();

      let bestScore = -1;
      let duplicateMatch = null;
      for (const enrolled of allEmbeddings) {
        if (!enrolled.embedding) {
          continue;
        }
        const score = BiometricEngine.compareFaces(avgEmbedding, enrolled.embedding);
        if (score > bestScore) {
          bestScore = score;
          duplicateMatch = enrolled;
        }
      }

      if (bestScore >= threshold && duplicateMatch && duplicateMatch.personnel_id !== personnelId) {
        throw new Error(`DUPLICATE_DETECTION:${duplicateMatch.name}:${duplicateMatch.personnel_id}:${(bestScore * 100).toFixed(1)}`);
      }

      // 2. Insert Personnel record in DB
      await DatabaseService.insertPersonnel({
        id: personnelId,
        name,
        photo_uri: null,
      });

      // 3. Store all 3 embeddings in SQLite database
      for (const emb of embeddings) {
        await DatabaseService.insertEmbedding(personnelId, emb);
      }

      // 4. Clean up captured URIs
      for (const uri of uris) {
        try {
          await RNFS.unlink(uri.replace(/^file:\/+/i, '/'));
        } catch (e) {}
      }

      // Refresh in-memory cache
      FaceRecognitionModule.invalidateCache();
      setStatus('success');
    } catch (err) {
      console.error('[CameraEnroll] Finalize error:', err);
      // Clean up captured URIs on failure
      for (const uri of uris) {
        try {
          await RNFS.unlink(uri.replace(/^file:\/+/i, '/'));
        } catch (e) {}
      }

      if (err.message && err.message.startsWith('DUPLICATE_DETECTION:')) {
        const parts = err.message.split(':');
        const dupName = parts[1];
        const dupId = parts[2];
        const dupScore = parts[3];
        Alert.alert(
          'Duplicate Face Detected',
          `This face is already registered under:\n\nName: ${dupName}\nID: ${dupId}\nSimilarity Match: ${dupScore}%\n\nEnrollment rejected to prevent duplicate identity fraud.`,
          [{ text: 'OK', onPress: () => {
            setStatus('idle');
            setEnrollStep(0);
            setCapturedCount(0);
          }}]
        );
      } else {
        setStatus('error');
        Alert.alert(
          'Enrollment Failed',
          err.message || 'An unexpected error occurred. Please try again.',
          [{ text: 'Retry', onPress: () => {
            setStatus('idle');
            setEnrollStep(0);
            setCapturedCount(0);
          }}]
        );
      }
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  // ── Success screen ──
  if (status === 'success') {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Icon name="check-circle" size={72} color={COLORS.success} />
          </View>
          <Text style={styles.successTitle}>Enrollment Successful!</Text>
          <Text style={styles.successSubtitle}>
            {name} has been enrolled with ID: {personnelId}
          </Text>
          <Text style={styles.successNote}>
            {CAPTURES_REQUIRED} face samples captured and stored locally.
          </Text>

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => navigation.navigate('EnrollForm')}
            activeOpacity={0.85}>
            <Icon name="account-plus" size={20} color="#fff" />
            <Text style={styles.doneBtnText}>Enroll Another</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => navigation.navigate('Home')}
            activeOpacity={0.85}>
            <Text style={styles.homeBtnText}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Camera screen ──
  return (
    <View style={styles.container}>
      {/* ── Camera Preview ── */}
      <RNCamera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        type={cameraType}
        captureAudio={false}
        onCameraReady={handleCameraReady}
        onMountError={handleCameraError}
        androidCameraPermissionOptions={{
          title: 'Camera Permission',
          message: 'SecureFace needs camera access for face enrollment.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }}
        notAuthorizedView={
          <View style={styles.noPermission}>
            <Icon name="camera-off" size={48} color={COLORS.error} />
            <Text style={styles.noPermissionText}>
              Camera permission denied. Please enable it in Settings.
            </Text>
          </View>
        }
      />

      {/* ── Camera Toggle Button ── */}
      <TouchableOpacity style={styles.toggleCameraBtn} onPress={toggleCamera}>
        <Icon name="camera-flip" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ── Face Guide Oval ── */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.guideWrap}>
          <View
            style={[
              styles.guideOval,
              cameraReady && status === 'scanning'
                ? (faceAlignment === 'aligned' ? styles.guideOvalAligned : styles.guideOvalUnaligned)
                : null,
            ]}
          />
        </View>

        {/* Status indicator */}
        <View
          style={[
            styles.faceStatus,
            {
              backgroundColor: !cameraReady
                ? COLORS.textDisabled
                : status === 'idle'
                ? COLORS.primary
                : faceAlignment === 'aligned'
                ? COLORS.success
                : COLORS.error,
            },
          ]}>
          <Icon
            name={
              !cameraReady
                ? 'camera-outline'
                : status === 'idle'
                ? 'camera-account'
                : faceAlignment === 'aligned'
                ? 'check-circle'
                : 'alert-circle-outline'
            }
            size={14}
            color="#fff"
          />
          <Text style={styles.faceStatusText}>
            {!cameraReady
              ? 'Initializing...'
              : status === 'idle'
              ? 'Ready to Scan'
              : alignmentReason}
          </Text>
        </View>
      </View>

      {/* ── Top Info Bar ── */}
      <View style={styles.topBar}>
        <Text style={styles.topBarName}>{name}</Text>
        <Text style={styles.topBarId}>ID: {personnelId}</Text>
      </View>

      {/* ── Bottom Controls ── */}
      <View style={styles.bottomBar}>
        {status === 'idle' ? (
          <>
            <Text style={styles.instruction}>
              {cameraReady
                ? 'Position your face inside the oval and tap Start Scan'
                : 'Camera is initializing, please wait...'}
            </Text>
            <TouchableOpacity
              style={[styles.captureBtn, !cameraReady && styles.captureBtnDisabled]}
              onPress={startScanning}
              disabled={!cameraReady}
              activeOpacity={0.85}>
              <Icon name="play-circle" size={28} color="#fff" />
              <Text style={styles.captureBtnText}>Start Face Scan</Text>
            </TouchableOpacity>
          </>
        ) : status === 'scanning' ? (
          <View style={styles.stepIndicatorContainer}>
            <View style={styles.stepRow}>
              <View style={[styles.stepDot, enrollStep >= 1 ? styles.stepDotCompleted : styles.stepDotPending]} />
              <View style={styles.stepLine} />
              <View style={[styles.stepDot, enrollStep >= 2 ? styles.stepDotCompleted : styles.stepDotPending]} />
              <View style={styles.stepLine} />
              <View style={[styles.stepDot, enrollStep >= 3 ? styles.stepDotCompleted : styles.stepDotPending]} />
            </View>
            <Text style={styles.instruction}>
              {enrollStep === 1 && 'Step 1 of 3: Look straight at camera'}
              {enrollStep === 2 && 'Step 2 of 3: Turn head slightly LEFT'}
              {enrollStep === 3 && 'Step 3 of 3: Turn head slightly RIGHT'}
            </Text>
            <Text style={styles.subInstruction}>
              {alignmentReason}
            </Text>
            <TouchableOpacity
              style={[
                styles.captureBtn,
                (faceAlignment !== 'aligned' || processing) && styles.captureBtnDisabled,
                { marginTop: SPACING.md }
              ]}
              onPress={() => captureAndAdvanceStep(enrollStep)}
              disabled={faceAlignment !== 'aligned' || processing}
              activeOpacity={0.85}>
              <Icon name="camera" size={22} color="#fff" />
              <Text style={styles.captureBtnText}>
                {enrollStep === 1 && 'Capture Front Face'}
                {enrollStep === 2 && 'Capture Left Profile'}
                {enrollStep === 3 && 'Capture Right Profile'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.progressWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.progressText}>
              {status === 'capturing'
                ? `Auto-capturing sample ${capturedCount} / ${CAPTURES_REQUIRED}...`
                : 'Processing and validating database entries...'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideOval: {
    width: GUIDE_SIZE,
    height: GUIDE_SIZE * 1.3,
    borderRadius: GUIDE_SIZE / 1.6,
    borderWidth: 3,
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
  guideOvalDetected: {
    borderColor: COLORS.success,
    borderStyle: 'dashed',
    borderWidth: 3,
  },
  faceStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginTop: SPACING.md,
  },
  faceStatusText: {
    color: '#fff',
    fontSize: FONT_SIZES.sm,
    ...FONTS.medium,
    marginLeft: 6,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: SPACING.md,
    alignItems: 'center',
  },
  topBarName: {
    color: '#fff',
    fontSize: FONT_SIZES.lg,
    ...FONTS.bold,
  },
  topBarId: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FONT_SIZES.sm,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: SPACING.lg,
    alignItems: 'center',
  },
  instruction: {
    color: '#fff',
    fontSize: FONT_SIZES.base,
    textAlign: 'center',
    marginBottom: SPACING.md,
    ...FONTS.regular,
  },
  captureBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  captureBtnDisabled: {
    opacity: 0.4,
  },
  captureBtnText: {
    color: '#fff',
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    marginLeft: SPACING.sm,
  },
  progressWrap: {
    alignItems: 'center',
  },
  progressText: {
    color: '#fff',
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.base,
    ...FONTS.regular,
  },
  toggleCameraBtn: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 24,
    padding: 10,
    zIndex: 10,
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
    fontSize: FONT_SIZES.base,
  },
  // ── Success ──
  successContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  successCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  successIcon: {
    marginBottom: SPACING.md,
  },
  successTitle: {
    fontSize: FONT_SIZES['2xl'],
    ...FONTS.bold,
    color: COLORS.success,
    marginBottom: SPACING.sm,
  },
  successSubtitle: {
    fontSize: FONT_SIZES.base,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  successNote: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  doneBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    ...SHADOWS.md,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: FONT_SIZES.md,
    ...FONTS.bold,
    marginLeft: SPACING.sm,
  },
  homeBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    alignItems: 'center',
  },
  homeBtnText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
    ...FONTS.medium,
  },
  // ── Step Indicator HUD ──
  stepIndicatorContainer: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: SPACING.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  stepDotPending: {
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
  },
  stepDotCompleted: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.success,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: SPACING.xs,
  },
  subInstruction: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: FONT_SIZES.sm,
    ...FONTS.regular,
    marginTop: 4,
    textAlign: 'center',
  },
});

export default CameraEnrollScreen;
