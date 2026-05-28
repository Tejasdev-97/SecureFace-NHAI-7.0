/**
 * LivenessModule.js
 * Offline liveness detection for SecureFace
 *
 * Liveness Challenges (anti-spoofing):
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. BLINK    - Detect eye closure via EAR (Eye Aspect Ratio) landmark analysis
 * 2. SMILE    - Detect mouth corner upward movement via landmarks
 * 3. HEAD_TURN - Detect head yaw rotation (left/right) via nose/ear distance
 *
 * Challenge Flow:
 *   - Randomly select 1–2 challenges from the pool
 *   - Present instruction text + countdown timer to user
 *   - Validate using landmark data from react-native-camera's face API
 *   - Must complete ALL challenges to pass liveness
 *
 * ⚠️  react-native-camera provides:
 *   face.leftEyeOpenProbability  [0..1]
 *   face.rightEyeOpenProbability [0..1]
 *   face.smilingProbability      [0..1]
 *   face.yawAngle                (degrees, negative=left, positive=right)
 *   face.rollAngle               (degrees)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Challenge definitions ─────────────────────────────────────────────────

export const LIVENESS_CHALLENGES = {
  BLINK: 'BLINK',
  SMILE: 'SMILE',
  HEAD_TURN_LEFT: 'HEAD_TURN_LEFT',
  HEAD_TURN_RIGHT: 'HEAD_TURN_RIGHT',
};

// Human-readable instructions for each challenge
export const CHALLENGE_INSTRUCTIONS = {
  [LIVENESS_CHALLENGES.BLINK]: '👁  Please BLINK your eyes',
  [LIVENESS_CHALLENGES.SMILE]: '😊  Please SMILE',
  [LIVENESS_CHALLENGES.HEAD_TURN_LEFT]: '⬅️  Turn your head to the LEFT',
  [LIVENESS_CHALLENGES.HEAD_TURN_RIGHT]: '➡️  Turn your head to the RIGHT',
};

// ─── Thresholds ────────────────────────────────────────────────────────────

const BLINK_EYE_CLOSED_THRESHOLD = 0.25;   // Eye open probability below this = closed
const SMILE_THRESHOLD = 0.75;              // Smiling probability above this = smiling
const HEAD_TURN_ANGLE = 20;               // Degrees yaw to count as a head turn

// ─── Module ────────────────────────────────────────────────────────────────

export const LivenessModule = {
  /**
   * Randomly pick `count` challenges from the pool.
   * @param {number} count - How many challenges to require (1 or 2)
   * @returns {string[]} Array of challenge keys
   */
  pickChallenges(count = 1) {
    const pool = Object.values(LIVENESS_CHALLENGES);
    const shuffled = pool.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, pool.length));
  },

  /**
   * Evaluate a single challenge against the current face data.
   *
   * @param {string} challenge - One of LIVENESS_CHALLENGES values
   * @param {object} faceData  - Face object from react-native-camera onFacesDetected
   * @returns {boolean} true if challenge is satisfied
   */
  evaluateChallenge(challenge, faceData) {
    if (!faceData) {
      return false;
    }

    switch (challenge) {
      case LIVENESS_CHALLENGES.BLINK: {
        // At least one eye must be nearly closed
        const leftClosed =
          faceData.leftEyeOpenProbability !== undefined
            ? faceData.leftEyeOpenProbability < BLINK_EYE_CLOSED_THRESHOLD
            : false;
        const rightClosed =
          faceData.rightEyeOpenProbability !== undefined
            ? faceData.rightEyeOpenProbability < BLINK_EYE_CLOSED_THRESHOLD
            : false;
        return leftClosed || rightClosed;
      }

      case LIVENESS_CHALLENGES.SMILE: {
        return (
          faceData.smilingProbability !== undefined &&
          faceData.smilingProbability > SMILE_THRESHOLD
        );
      }

      case LIVENESS_CHALLENGES.HEAD_TURN_LEFT: {
        // Negative yaw = head turned left (user's perspective)
        return (
          faceData.yawAngle !== undefined &&
          faceData.yawAngle < -HEAD_TURN_ANGLE
        );
      }

      case LIVENESS_CHALLENGES.HEAD_TURN_RIGHT: {
        // Positive yaw = head turned right
        return (
          faceData.yawAngle !== undefined &&
          faceData.yawAngle > HEAD_TURN_ANGLE
        );
      }

      default:
        return false;
    }
  },

  /**
   * Check if a face is in the "neutral" position (for baseline detection).
   * Used to ensure the user starts centered before a challenge begins.
   */
  isFaceNeutral(faceData) {
    if (!faceData) {
      return false;
    }
    const eyesOpen =
      (faceData.leftEyeOpenProbability || 1) > 0.6 &&
      (faceData.rightEyeOpenProbability || 1) > 0.6;
    const notSmiling = (faceData.smilingProbability || 0) < 0.4;
    const headStraight =
      Math.abs(faceData.yawAngle || 0) < 15 &&
      Math.abs(faceData.rollAngle || 0) < 20;
    return eyesOpen && notSmiling && headStraight;
  },

  /**
   * Validate that a face bounding box is large enough (anti-photo-from-distance).
   * Requires the face to occupy at least 10% of the screen width.
   *
   * @param {object} bounds  - face.bounds from react-native-camera
   * @param {number} screenW - Screen width in pixels
   * @returns {boolean}
   */
  isFaceCloseEnough(bounds, screenW) {
    if (!bounds || !screenW) {
      return true; // permissive if data unavailable
    }
    const faceWidth = bounds.size ? bounds.size.width : 0;
    return faceWidth > screenW * 0.1;
  },

  /**
   * Run a full multi-challenge liveness session.
   * This is a state machine helper — the actual frame processing is done
   * in the CameraAttendanceScreen via onFacesDetected callback.
   *
   * Returns the initial session state object.
   */
  createLivenessSession(challengeCount = 1) {
    const challenges = this.pickChallenges(challengeCount);
    return {
      challenges,
      currentIndex: 0,
      completedChallenges: [],
      startTime: Date.now(),
      status: 'pending', // 'pending' | 'in_progress' | 'passed' | 'failed'
      timeoutMs: 15000,  // 15 seconds per challenge
    };
  },

  /**
   * Process a face frame against the current session state.
   * Returns the updated session and a flag if the session is complete.
   *
   * @param {object} session - LivenessSession from createLivenessSession
   * @param {object} faceData - Current face from onFacesDetected
   * @returns {{ session: object, completed: boolean, passed: boolean }}
   */
  processFrame(session, faceData) {
    if (session.status === 'passed' || session.status === 'failed') {
      return {session, completed: true, passed: session.status === 'passed'};
    }

    // Timeout check
    const elapsed = Date.now() - session.startTime;
    if (elapsed > session.timeoutMs * session.challenges.length) {
      return {
        session: {...session, status: 'failed'},
        completed: true,
        passed: false,
      };
    }

    const currentChallenge = session.challenges[session.currentIndex];
    const satisfied = this.evaluateChallenge(currentChallenge, faceData);

    if (satisfied) {
      const completedChallenges = [...session.completedChallenges, currentChallenge];
      const nextIndex = session.currentIndex + 1;

      if (nextIndex >= session.challenges.length) {
        // All challenges done!
        return {
          session: {
            ...session,
            completedChallenges,
            currentIndex: nextIndex,
            status: 'passed',
          },
          completed: true,
          passed: true,
        };
      }

      // Move to next challenge
      return {
        session: {
          ...session,
          completedChallenges,
          currentIndex: nextIndex,
        },
        completed: false,
        passed: false,
      };
    }

    // Challenge not yet satisfied — keep waiting
    return {session: {...session, status: 'in_progress'}, completed: false, passed: false};
  },
};

export default LivenessModule;
