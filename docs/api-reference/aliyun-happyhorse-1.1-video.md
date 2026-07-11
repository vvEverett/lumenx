# Alibaba Cloud HappyHorse 1.1 video API evidence

- Source pages:
  - https://help.aliyun.com/zh/model-studio/happyhorse-text-to-video-api-reference
  - https://help.aliyun.com/zh/model-studio/happyhorse-image-to-video-api-reference
  - https://help.aliyun.com/zh/model-studio/happyhorse-reference-to-video-api-reference
  - https://help.aliyun.com/zh/model-studio/video-generate-edit-model
- Captured: 2026-07-11
- Scope: HappyHorse 1.1 text-to-video, first-frame image-to-video, and reference-image-to-video
- Snapshot ID: `aliyun/happyhorse-1.1/2026-07-11`

## Model inventory

| Model | Capability | Inputs | Output |
| --- | --- | --- | --- |
| `happyhorse-1.1-t2v` | Text-to-video with audio | Required prompt | 720P/1080P, 3–15s, 24fps MP4 |
| `happyhorse-1.1-i2v` | First-frame image-to-video with audio | One `first_frame`; prompt optional | 720P/1080P, 3–15s, 24fps MP4 |
| `happyhorse-1.1-r2v` | Reference-image-to-video with audio | 1–9 `reference_image` items; required prompt | 720P/1080P, 3–15s, 24fps MP4 |

All three use the asynchronous DashScope video synthesis endpoint. Supported common parameters are `resolution`, integer `duration`, `watermark`, and `seed`. T2V and R2V additionally support `ratio`: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `4:5`, `5:4`, `9:21`, or `21:9`. I2V preserves the first frame's aspect ratio and does not accept `ratio`.

This is a repo-local staging mirror under the model-onboarding Mode B workflow. Promotion to the canonical raw vendor-doc archive and Context Hub remains external to this repository.
