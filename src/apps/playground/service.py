"""Playground service layer -- orchestrates AI generation by delegating to existing model adapters.

Routes based on model_id to the appropriate adapter (WanxModel, KlingModel,
ViduModel, MuleRouterVideoModel/ImageModel, WanxImageModel).  Mirrors the
routing logic in ``src/apps/comic_gen/pipeline.py:process_video_task()``.
"""

import os
import shutil
import uuid
from datetime import datetime, timezone
from typing import Optional

from .models import (
    GenerateRequest,
    PlaygroundGeneration,
    PlaygroundLibraryItem,
    PlaygroundMode,
    PlaygroundOutput,
)
from .storage import PlaygroundStorage
from ...utils import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Output directories
# ---------------------------------------------------------------------------
IMAGE_OUTPUT_DIR = os.path.join("output", "playground", "images")
VIDEO_OUTPUT_DIR = os.path.join("output", "playground", "videos")
LIBRARY_OUTPUT_DIR = os.path.join("output", "assets", "playground")


class PlaygroundService:
    """High-level service that creates generation records and delegates to
    the correct model adapter for execution."""

    def __init__(self, storage: PlaygroundStorage):
        self.storage = storage
        # Lazy-initialised model instances (cached for the lifetime of the service)
        self._wanx_model = None
        self._wanx_image_model = None
        self._kling_model = None
        self._vidu_model = None
        self._mulerouter_video_model = None
        self._mulerouter_image_model = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_generation(self, request: GenerateRequest) -> PlaygroundGeneration:
        """Create a :class:`PlaygroundGeneration` record with *status=pending*,
        persist it via storage, and return it."""
        gen = PlaygroundGeneration(
            id=str(uuid.uuid4()),
            mode=request.mode,
            model_id=request.model_id,
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            input_media=request.input_media or [],
            parameters=request.parameters or {},
            batch_size=request.batch_size or 1,
            outputs=[],
            status="pending",
            error=None,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self.storage.add_generation(gen)
        return gen

    def process_generation(self, generation_id: str) -> None:
        """Execute the actual generation.  Intended to run in a background
        thread -- all calls are synchronous (blocking)."""
        gen = self.storage.get_generation(generation_id)
        if gen is None:
            logger.error("Generation %s not found", generation_id)
            return

        # Mark processing
        gen.status = "processing"
        self.storage.update_generation(gen)

        try:
            mode = gen.mode
            if mode in (PlaygroundMode.T2I, PlaygroundMode.I2I):
                self._process_image_generation(gen)
            elif mode in (PlaygroundMode.T2V, PlaygroundMode.I2V, PlaygroundMode.R2V, PlaygroundMode.V2V):
                self._process_video_generation(gen)
            else:
                raise ValueError(f"Unsupported playground mode: {mode}")

            gen.status = "completed"
        except Exception as exc:
            logger.exception("Generation %s failed", generation_id)
            gen.status = "failed"
            gen.error = str(exc)

        self.storage.update_generation(gen)

    def save_to_library(self, generation_id: str, output_id: str, category: str = "general") -> bool:
        """Copy a generated output to ``output/assets/{category}/`` and flag
        :pyattr:`PlaygroundOutput.saved_to_library` = True."""
        gen = self.storage.get_generation(generation_id)
        if gen is None:
            logger.warning("save_to_library: generation %s not found", generation_id)
            return False

        target_output: Optional[PlaygroundOutput] = None
        for out in gen.outputs:
            if out.id == output_id:
                target_output = out
                break
        if target_output is None:
            logger.warning("save_to_library: output %s not found in generation %s", output_id, generation_id)
            return False

        src_path = self._resolve_existing_local_path(target_output.media_path)
        if not src_path:
            logger.error("save_to_library: source file not found: %s", target_output.media_path)
            return False

        dest_dir = os.path.join(LIBRARY_OUTPUT_DIR, category)
        os.makedirs(dest_dir, exist_ok=True)

        existing_item = self.storage.get_library_item_by_source(generation_id, output_id)
        dest_filename = f"{output_id}_{os.path.basename(src_path)}"
        dest_path = existing_item.media_path if existing_item else os.path.join(dest_dir, dest_filename)
        resolved_dest = self._resolve_local_output_path(dest_path)
        if resolved_dest is None:
            logger.error("save_to_library: invalid destination path: %s", dest_path)
            return False

        os.makedirs(os.path.dirname(resolved_dest), exist_ok=True)
        if not os.path.isfile(resolved_dest):
            shutil.copy2(src_path, resolved_dest)
        logger.info("Saved output %s to library: %s", output_id, resolved_dest)

        target_output.saved_to_library = True
        target_output.library_path = self._to_output_relative_path(resolved_dest)
        library_item = PlaygroundLibraryItem(
            id=existing_item.id if existing_item else str(uuid.uuid4()),
            generation_id=generation_id,
            output_id=output_id,
            media_path=target_output.library_path,
            original_media_path=target_output.media_path,
            media_type=target_output.media_type,
            thumbnail_path=target_output.thumbnail_path,
            category=category,
            prompt=gen.prompt,
            model_id=gen.model_id,
            created_at=existing_item.created_at if existing_item else datetime.now(timezone.utc).isoformat(),
        )
        self.storage.upsert_library_item(library_item)
        self.storage.update_generation(gen)
        return True

    def unsave_from_library(self, generation_id: str, output_id: str) -> bool:
        """Remove a generated output from the playground asset library."""
        gen = self.storage.get_generation(generation_id)
        if gen is None:
            logger.warning("unsave_from_library: generation %s not found", generation_id)
            return False

        target_output: Optional[PlaygroundOutput] = None
        for out in gen.outputs:
            if out.id == output_id:
                target_output = out
                break
        if target_output is None:
            logger.warning("unsave_from_library: output %s not found in generation %s", output_id, generation_id)
            return False

        item = self.storage.get_library_item_by_source(generation_id, output_id)
        if item:
            removed = self.storage.delete_library_item(item.id)
            if removed:
                self._delete_local_output_file(removed.media_path)

        target_output.saved_to_library = False
        target_output.library_path = None
        self.storage.update_generation(gen)
        return True

    def delete_generation(self, generation_id: str) -> bool:
        """Delete a generation record and its original output files."""
        gen = self.storage.get_generation(generation_id)
        if gen is None:
            return False

        for output in gen.outputs:
            self._delete_output_files(output)
        return self.storage.delete_generation(generation_id)

    def delete_output(self, generation_id: str, output_id: str) -> Optional[PlaygroundGeneration]:
        """Delete one output from a generation. Returns updated generation, or None if emptied."""
        gen = self.storage.get_generation(generation_id)
        if gen is None:
            return None

        target_output: Optional[PlaygroundOutput] = None
        kept_outputs = []
        for output in gen.outputs:
            if output.id == output_id:
                target_output = output
            else:
                kept_outputs.append(output)

        if target_output is None:
            return gen

        self._delete_output_files(target_output)
        gen.outputs = kept_outputs

        if not gen.outputs:
            self.storage.delete_generation(generation_id)
            return None

        self.storage.update_generation(gen)
        return gen

    # ------------------------------------------------------------------
    # Local file helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _is_remote_path(path: str) -> bool:
        return path.startswith(("http://", "https://", "data:", "blob:"))

    def _resolve_local_output_path(self, path: Optional[str]) -> Optional[str]:
        """Resolve a path only if it stays inside the local output directory."""
        if not path or self._is_remote_path(path):
            return None

        output_root = os.path.abspath("output")
        candidates = [path] if os.path.isabs(path) else []
        clean = path.lstrip("/").replace("\\", os.sep)
        if not os.path.isabs(path):
            candidates.append(clean)
            if not clean.startswith("output" + os.sep) and clean != "output":
                candidates.append(os.path.join("output", clean))

        for candidate in candidates:
            abs_path = os.path.abspath(candidate)
            if abs_path == output_root or abs_path.startswith(output_root + os.sep):
                return abs_path
        return None

    def _resolve_existing_local_path(self, path: Optional[str]) -> Optional[str]:
        abs_path = self._resolve_local_output_path(path)
        if abs_path and os.path.isfile(abs_path):
            return abs_path
        return None

    @staticmethod
    def _to_output_relative_path(abs_path: str) -> str:
        return os.path.relpath(abs_path, os.path.abspath(".")).replace(os.sep, "/")

    def _delete_local_output_file(self, path: Optional[str]) -> None:
        abs_path = self._resolve_existing_local_path(path)
        if not abs_path:
            return
        try:
            os.remove(abs_path)
        except OSError as exc:
            logger.warning("Failed to delete local output file %s: %s", abs_path, exc)

    def _delete_output_files(self, output: PlaygroundOutput) -> None:
        self._delete_local_output_file(output.media_path)
        self._delete_local_output_file(output.thumbnail_path)

    # ------------------------------------------------------------------
    # Image generation (t2i / i2i)
    # ------------------------------------------------------------------

    def _process_image_generation(self, gen: PlaygroundGeneration) -> None:
        os.makedirs(IMAGE_OUTPUT_DIR, exist_ok=True)

        model_lower = gen.model_id.lower()
        failures = []

        for idx in range(gen.batch_size):
            ext = "png"
            out_filename = f"{gen.mode.value}_{gen.id}_{idx}.{ext}"
            out_path = os.path.join(IMAGE_OUTPUT_DIR, out_filename)

            try:
                if model_lower.startswith("gpt-image"):
                    self._generate_image_mulerouter(gen, out_path, idx)
                else:
                    self._generate_image_wanx(gen, out_path, idx)

                output_entry = PlaygroundOutput(
                    id=str(uuid.uuid4()),
                    media_path=out_path,
                    media_type="image",
                )
                gen.outputs.append(output_entry)
                self.storage.update_generation(gen)
            except Exception as exc:
                logger.error("Image generation %s batch %d failed: %s", gen.id, idx, exc)
                failures.append(str(exc))

        if failures and not gen.outputs:
            raise RuntimeError(f"All {len(failures)} batch items failed: {failures[0]}")

    def _generate_image_wanx(self, gen: PlaygroundGeneration, out_path: str, _idx: int) -> None:
        """Delegate to :class:`WanxImageModel` (DashScope image generation)."""
        from ...models.image import WanxImageModel

        if self._wanx_image_model is None:
            self._wanx_image_model = WanxImageModel({})

        params = gen.parameters
        kwargs = {
            "model_name": gen.model_id,
            "size": params.get("size", "1280*1280"),
            "n": 1,
            "negative_prompt": gen.negative_prompt,
            "seed": params.get("seed"),
            "prompt_extend": params.get("prompt_extend", True),
            "watermark": params.get("watermark", False),
        }

        # i2i: attach reference images from input_media
        ref_paths = list(gen.input_media) if gen.mode == PlaygroundMode.I2I else []
        if ref_paths:
            kwargs["ref_image_paths"] = ref_paths

        self._wanx_image_model.generate(
            prompt=gen.prompt,
            output_path=out_path,
            **kwargs,
        )

    def _generate_image_mulerouter(self, gen: PlaygroundGeneration, out_path: str, _idx: int) -> None:
        """Delegate to :class:`MuleRouterImageModel` (GPT-Image-2)."""
        from ...models.mulerouter import MuleRouterImageModel

        if self._mulerouter_image_model is None:
            self._mulerouter_image_model = MuleRouterImageModel({})

        params = gen.parameters
        kwargs = {
            "size": params.get("size", "1024x1024"),
            "quality": params.get("quality", "high"),
            "n": 1,
        }

        # i2i: attach reference images
        if gen.mode == PlaygroundMode.I2I and gen.input_media:
            kwargs["ref_image_paths"] = list(gen.input_media)

        self._mulerouter_image_model.generate(
            prompt=gen.prompt,
            output_path=out_path,
            **kwargs,
        )

    # ------------------------------------------------------------------
    # Video generation (t2v / i2v / r2v / v2v)
    # ------------------------------------------------------------------

    def _process_video_generation(self, gen: PlaygroundGeneration) -> None:
        os.makedirs(VIDEO_OUTPUT_DIR, exist_ok=True)

        model_lower = gen.model_id.lower()
        failures = []

        for idx in range(gen.batch_size):
            out_filename = f"{gen.mode.value}_{gen.id}_{idx}.mp4"
            out_path = os.path.join(VIDEO_OUTPUT_DIR, out_filename)

            try:
                if model_lower.startswith("seedance"):
                    self._generate_video_mulerouter(gen, out_path)
                elif model_lower.startswith("kling"):
                    self._generate_video_kling(gen, out_path)
                elif model_lower.startswith("vidu") or model_lower.startswith("viduq"):
                    self._generate_video_vidu(gen, out_path)
                elif model_lower.startswith("happyhorse"):
                    self._generate_video_wanx(gen, out_path)
                elif model_lower.startswith("pixverse"):
                    self._generate_video_wanx(gen, out_path)
                else:
                    self._generate_video_wanx(gen, out_path)

                output_entry = PlaygroundOutput(
                    id=str(uuid.uuid4()),
                    media_path=out_path,
                    media_type="video",
                )
                gen.outputs.append(output_entry)
                self.storage.update_generation(gen)
            except Exception as exc:
                logger.error("Video generation %s batch %d failed: %s", gen.id, idx, exc)
                failures.append(str(exc))

        if failures and not gen.outputs:
            raise RuntimeError(f"All {len(failures)} batch items failed: {failures[0]}")

    # -- adapter delegates ------------------------------------------------

    def _generate_video_wanx(self, gen: PlaygroundGeneration, out_path: str) -> None:
        """Delegate to :class:`WanxModel` (DashScope video generation -- wan2.x / happyhorse)."""
        from ...models.wanx import WanxModel

        if self._wanx_model is None:
            self._wanx_model = WanxModel({})

        params = gen.parameters
        img_path, img_url = self._resolve_first_input_media(gen)

        kwargs = {
            "model": gen.model_id,
            "duration": params.get("duration", 5),
            "resolution": params.get("resolution", "720P"),
            "seed": params.get("seed"),
            "negative_prompt": gen.negative_prompt,
            "prompt_extend": params.get("prompt_extend", True),
            "watermark": params.get("watermark", False),
            "ratio": params.get("ratio"),
            "audio_url": params.get("audio_url"),
        }

        # r2v: reference images
        if gen.mode == PlaygroundMode.R2V and gen.input_media:
            kwargs["ref_image_urls"] = list(gen.input_media)

        # v2v: video input
        if gen.mode == PlaygroundMode.V2V and gen.input_media:
            kwargs["video_url"] = gen.input_media[0]

        self._wanx_model.generate(
            prompt=gen.prompt,
            output_path=out_path,
            img_path=img_path,
            img_url=img_url,
            **kwargs,
        )

    def _generate_video_mulerouter(self, gen: PlaygroundGeneration, out_path: str) -> None:
        """Delegate to :class:`MuleRouterVideoModel` (Seedance 2.0)."""
        from ...models.mulerouter import MuleRouterVideoModel

        if self._mulerouter_video_model is None:
            self._mulerouter_video_model = MuleRouterVideoModel({})

        params = gen.parameters
        img_path, img_url = self._resolve_first_input_media(gen)

        kwargs = {
            "duration": params.get("duration", 5),
            "resolution": params.get("resolution", "1080p"),
            "aspect_ratio": params.get("aspect_ratio", "16:9"),
            "seed": params.get("seed"),
            "watermark": params.get("watermark", False),
        }

        # r2v: reference images
        if gen.mode == PlaygroundMode.R2V and gen.input_media:
            kwargs["generation_mode"] = "r2v"
            kwargs["ref_image_urls"] = list(gen.input_media)

        self._mulerouter_video_model.generate(
            prompt=gen.prompt,
            output_path=out_path,
            img_url=img_url,
            img_path=img_path,
            **kwargs,
        )

    def _generate_video_kling(self, gen: PlaygroundGeneration, out_path: str) -> None:
        """Delegate to :class:`KlingModel`."""
        from ...models.kling import KlingModel

        if self._kling_model is None:
            self._kling_model = KlingModel({})

        params = gen.parameters
        img_path, img_url = self._resolve_first_input_media(gen)

        self._kling_model.generate(
            prompt=gen.prompt,
            output_path=out_path,
            img_url=img_url,
            img_path=img_path,
            duration=params.get("duration", 5),
            model=gen.model_id,
            negative_prompt=gen.negative_prompt,
            aspect_ratio=params.get("aspect_ratio", "16:9"),
            mode=params.get("mode", "std"),
            sound=params.get("sound", "off"),
            cfg_scale=params.get("cfg_scale"),
        )

    def _generate_video_vidu(self, gen: PlaygroundGeneration, out_path: str) -> None:
        """Delegate to :class:`ViduModel`."""
        from ...models.vidu import ViduModel

        if self._vidu_model is None:
            self._vidu_model = ViduModel({})

        params = gen.parameters
        img_path, img_url = self._resolve_first_input_media(gen)

        self._vidu_model.generate(
            prompt=gen.prompt,
            output_path=out_path,
            img_url=img_url,
            img_path=img_path,
            duration=params.get("duration", 5),
            model=gen.model_id,
            resolution=params.get("resolution", "720p"),
            aspect_ratio=params.get("aspect_ratio", "16:9"),
            seed=params.get("seed", 0),
            audio=params.get("audio", True),
            movement_amplitude=params.get("movement_amplitude", "auto"),
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_first_input_media(gen: PlaygroundGeneration):
        """Return ``(img_path, img_url)`` for the first entry in
        :pyattr:`input_media`.  Local files are returned as *img_path*;
        remote URLs as *img_url*."""
        if not gen.input_media:
            return None, None

        first = gen.input_media[0]
        if first.startswith(("http://", "https://")):
            return None, first

        # Try as-is, then relative to output/
        if os.path.exists(first):
            return first, None
        candidate = os.path.join("output", first)
        if os.path.exists(candidate):
            return candidate, None

        # Fall back to treating it as a URL-like reference
        return None, first
