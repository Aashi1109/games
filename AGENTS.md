# Project asset conventions

- Keep the design document at `design/design.pen` and all design images under `design/assets/` (subfolders are allowed). Do not leave generated images in the project root or create an `assests/` directory.
- Reference design images using `assets/...` paths relative to `design/design.pen`, not `design/assets/...`. Update all affected references whenever moving an image.
- If an image-generation tool writes beside the design document, move the image into `design/assets/` after generation completes and update its canvas image-fill references before finishing.
- Keep shared application assets in the existing project-root `assets/`; do not mix design-only images into that directory.
- Preserve existing runtime public assets and model texture layouts unless explicitly migrating those pipelines.
