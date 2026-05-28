# AI Model Assets — SecureFace

## Model Directory

Place your TFLite model files here for Android deployment:

```
src/models/
├── README.md                ← This file
├── mobilefacenet.tflite     ← Face embedding model (PLACE HERE)
└── .gitkeep
```

## Recommended Models

### 1. MobileFaceNet (RECOMMENDED for hackathon)
- **Size**: ~4 MB
- **Input**: 112×112 RGB float32
- **Output**: 128-dim float32 embedding
- **Download**: https://github.com/sirius-ai/MobileFaceNet_TF
- **Steps**:
  1. Clone the repo
  2. Run `python export_tflite.py`
  3. Copy `mobilefacenet.tflite` here

### 2. FaceNet-128 (alternative)
- **Size**: ~20 MB
- **Input**: 160×160 RGB float32
- **Output**: 128-dim float32 embedding
- **Source**: https://github.com/davidsandberg/facenet

### 3. ArcFace-MobileNetV2 (ONNX, alternative)
- **Size**: ~14 MB
- **Format**: ONNX → convert to TFLite with `onnx-tf`
- **Source**: https://github.com/deepinsight/insightface

## Integration Notes

After placing the model file:

1. **Android**: Copy to `android/app/src/main/assets/`
2. **iOS**: Drag into Xcode project → Target → Copy Bundle Resources

Then update `FaceRecognitionModule.js`:

```javascript
// Replace simulateEmbeddingFromImage() with:
async extractEmbedding(imageBase64) {
  const tflite = await TFLite.loadModel({ model: 'mobilefacenet.tflite' });
  const input = await preprocessImageToFloat32(imageBase64, 112, 112);
  const [output] = await tflite.run([input]);
  return l2Normalize(Array.from(output));
}
```

## Model Performance Targets

| Metric                    | Target    | MobileFaceNet |
|---------------------------|-----------|---------------|
| Inference time (CPU)      | < 200 ms  | ~50–80 ms    |
| Model file size           | < 10 MB   | ~4 MB        |
| Accuracy (LFW benchmark)  | > 95%     | ~99.28%      |
| RAM usage                 | < 100 MB  | ~60 MB       |

All within the hackathon constraints (< 20 MB bundle, 3 GB RAM minimum).
