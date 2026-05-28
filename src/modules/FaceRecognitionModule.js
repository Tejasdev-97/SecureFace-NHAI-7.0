/**
 * FaceRecognitionModule.js
 * Offline face recognition engine for SecureFace
 *
 * Architecture:
 * ─────────────────────────────────────────────────────────────────────────────
 * For the hackathon prototype, we use a SIMULATED embedding approach backed by
 * a deterministic feature extraction from image data. In a production build,
 * replace `extractEmbedding()` with a TFLite / ONNX Mobile FaceNet inference.
 *
 * The comparison logic (cosine similarity) is production-ready and will work
 * unchanged once you drop in a real model bridge.
 *
 * Model placement (for real TFLite integration):
 *   Android: android/app/src/main/assets/facenet.tflite
 *   iOS:     ios/SecureFace/facenet.tflite (add to Xcode bundle)
 *
 * Recommended open-source models (<20 MB):
 *   - FaceNet (128-d) from davidsandberg/facenet → ~20 MB TFLite
 *   - MobileFaceNet    → ~4 MB TFLite  ← Recommended for hackathon
 *   - ArcFace-MobileNet → ~14 MB ONNX
 * ─────────────────────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {DatabaseService} from './DatabaseService';
import {BiometricEngine} from './BiometricEngine';

// ─── Constants ────────────────────────────────────────────────────────────────
const EMBEDDING_DIM = 12;            // Geometric ratios dimension
const DEFAULT_THRESHOLD = 0.82;     // Cosine similarity threshold for geometric ratio matching
const THRESHOLD_STORAGE_KEY = '@SecureFace:similarityThreshold';

// ─── In-memory cache ──────────────────────────────────────────────────────────
// Loaded on first recognition call, refreshed after enrollment.
let embeddingCache = null; // [{ personnel_id, name, embedding: number[] }]


// ─── FaceRecognitionModule ────────────────────────────────────────────────────
export const FaceRecognitionModule = {
  /**
   * Invalidate in-memory cache (call after enrollment).
   */
  invalidateCache() {
    embeddingCache = null;
    console.log('[FaceRec] Embedding cache invalidated');
  },

  /**
   * Load all embeddings from SQLite into memory.
   * Cached until invalidated.
   */
  async loadEmbeddings() {
    if (embeddingCache !== null) {
      return embeddingCache;
    }
    embeddingCache = await DatabaseService.getAllEmbeddings();
    console.log(`[FaceRec] Loaded ${embeddingCache.length} embeddings into cache`);
    return embeddingCache;
  },

  /**
   * Extract a face embedding from a captured image.
   *
   * @param {string} imageUri - file URI of captured photo
   * @returns {Promise<number[] | null>} 12-dim geometric ratio vector or null
   */
  async extractEmbedding(imageUri) {
    const res = await BiometricEngine.extractFeatures(imageUri);
    if (!res || !res.features) {
      return null;
    }
    return res.features;
  },

  /**
   * Enroll a person: extract embedding and store in DB.
   *
   * @param {string} personnelId
   * @param {string} imageUri
   * @returns {Promise<string>} embedding DB ID
   */
  async enrollFace(personnelId, imageUri) {
    const embedding = await this.extractEmbedding(imageUri);
    if (!embedding) {
      throw new Error('Face features could not be extracted. Make sure your face is centered, fully visible, and has good lighting.');
    }
    const embId = await DatabaseService.insertEmbedding(personnelId, embedding);
    this.invalidateCache(); // Force reload on next recognition
    return embId;
  },

  /**
   * Recognize a face against all enrolled embeddings.
   *
   * @param {string} imageUri - Live camera capture file URI
   * @returns {Promise<{
   *   matched: boolean,
   *   personnel_id: string|null,
   *   name: string|null,
   *   confidence: number,
   *   threshold: number,
   *   error?: string
   * }>}
   */
  async recognizeFace(imageUri) {
    // Get threshold from settings (default 0.82)
    const storedThreshold = await AsyncStorage.getItem(THRESHOLD_STORAGE_KEY);
    const threshold = storedThreshold ? parseFloat(storedThreshold) : DEFAULT_THRESHOLD;

    const allEmbeddings = await this.loadEmbeddings();

    if (allEmbeddings.length === 0) {
      return {matched: false, personnel_id: null, name: null, confidence: 0, threshold};
    }

    const currentFeatures = await this.extractEmbedding(imageUri);
    if (!currentFeatures) {
      return {matched: false, personnel_id: null, name: null, confidence: 0, threshold, error: 'no_face'};
    }

    // Compare against all enrolled embeddings to find the best match
    let bestScore = -1;
    let bestMatch = null;

    for (const enrolled of allEmbeddings) {
      if (!enrolled.embedding) {
        continue;
      }
      const score = BiometricEngine.compareFaces(currentFeatures, enrolled.embedding);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = enrolled;
      }
    }
    const matched = bestScore >= threshold;
    return {
      matched,
      personnel_id: matched ? bestMatch.personnel_id : null,
      name: matched ? bestMatch.name : null,
      confidence: bestScore,
      threshold,
      closest_personnel_id: bestMatch ? bestMatch.personnel_id : null,
      closest_name: bestMatch ? bestMatch.name : null,
    };
  },

  /**
   * Helper: get the configured threshold.
   */
  async getThreshold() {
    const stored = await AsyncStorage.getItem(THRESHOLD_STORAGE_KEY);
    return stored ? parseFloat(stored) : DEFAULT_THRESHOLD;
  },

  /**
   * Helper: update threshold in settings.
   */
  async setThreshold(value) {
    await AsyncStorage.setItem(THRESHOLD_STORAGE_KEY, String(value));
  },
};

export default FaceRecognitionModule;
