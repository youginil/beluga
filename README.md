# Beluga

```
node scripts/icon.js
TAURI_ENV_DEBUG=1 RUST_BACKTRACE=full pnpm tauri dev
TAURI_ENV_DEBUG=1 RUST_BACKTRACE=full pnpm tauri android dev -v
pnpm tauri build
```

```
#!/bin/sh

DETECTION_MODEL="https://ocrs-models.s3-accelerate.amazonaws.com/text-detection.rten"
RECOGNITION_MODEL="https://ocrs-models.s3-accelerate.amazonaws.com/text-recognition.rten"

curl "$DETECTION_MODEL" -o text-detection.rten
curl "$RECOGNITION_MODEL" -o text-recognition.rten
```
