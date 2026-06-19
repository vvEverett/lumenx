"""Playground storage layer — JSON-file persistence for generation history and templates."""

import json
import os
import threading
import uuid
from typing import List, Optional

from .models import PlaygroundGeneration, PlaygroundLibraryItem, PlaygroundTemplate
from ...utils import get_logger

logger = get_logger(__name__)


class PlaygroundStorage:
    HISTORY_PATH = "output/playground_history.json"
    LIBRARY_PATH = "output/playground_library.json"
    TEMPLATES_PATH = "output/playground_templates.json"

    def __init__(self):
        self._history: List[PlaygroundGeneration] = []
        self._library: List[PlaygroundLibraryItem] = []
        self._templates: List[PlaygroundTemplate] = []
        self._lock = threading.RLock()
        self._load()

    # ------------------------------------------------------------------
    # Internal persistence
    # ------------------------------------------------------------------

    def _load(self) -> None:
        """Load both JSON files, creating them if missing."""
        self._history = self._load_file(self.HISTORY_PATH, PlaygroundGeneration)
        self._library = self._load_file(self.LIBRARY_PATH, PlaygroundLibraryItem)
        self._templates = self._load_file(self.TEMPLATES_PATH, PlaygroundTemplate)
        self._migrate_legacy_library_flags()

    @staticmethod
    def _load_file(path: str, model_cls):
        """Read a JSON array file and parse each element into *model_cls*."""
        if not os.path.exists(path):
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            return [model_cls.model_validate(item) for item in raw]
        except Exception as e:
            logger.error("Failed to load %s: %s", path, e)
            return []

    def _save_history(self) -> None:
        self._save_file(self.HISTORY_PATH, self._history)

    def _save_library(self) -> None:
        self._save_file(self.LIBRARY_PATH, self._library)

    def _save_templates(self) -> None:
        self._save_file(self.TEMPLATES_PATH, self._templates)

    def _save_file(self, path: str, items: list) -> None:
        with self._lock:
            try:
                os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(
                        [item.model_dump() for item in items],
                        f,
                        indent=2,
                        ensure_ascii=False,
                    )
            except Exception as e:
                logger.error("Failed to save %s: %s", path, e)

    def _migrate_legacy_library_flags(self) -> None:
        """Create catalog entries for older history records saved before library JSON existed."""
        changed_library = False
        changed_history = False

        for gen in self._history:
            for output in gen.outputs:
                if not output.saved_to_library:
                    continue
                if self.get_library_item_by_source(gen.id, output.id):
                    continue

                media_path = output.library_path
                if not media_path:
                    basename = os.path.basename(output.media_path)
                    legacy_copy = os.path.join("output", "assets", "general", basename).replace(os.sep, "/")
                    media_path = legacy_copy if os.path.exists(legacy_copy) else output.media_path
                    output.library_path = media_path
                    changed_history = True

                self._library.append(
                    PlaygroundLibraryItem(
                        id=str(uuid.uuid4()),
                        generation_id=gen.id,
                        output_id=output.id,
                        media_path=media_path,
                        original_media_path=output.media_path,
                        media_type=output.media_type,
                        thumbnail_path=output.thumbnail_path,
                        category="general",
                        prompt=gen.prompt,
                        model_id=gen.model_id,
                        created_at=gen.created_at,
                    )
                )
                changed_library = True

        if changed_library:
            self._save_library()
        if changed_history:
            self._save_history()

    # ------------------------------------------------------------------
    # History CRUD
    # ------------------------------------------------------------------

    def add_generation(self, gen: PlaygroundGeneration) -> None:
        """Append a generation record and persist."""
        self._history.append(gen)
        self._save_history()

    def get_generation(self, gen_id: str) -> Optional[PlaygroundGeneration]:
        """Look up a generation by its id."""
        for gen in self._history:
            if gen.id == gen_id:
                return gen
        return None

    def list_history(
        self, limit: int = 50, offset: int = 0
    ) -> List[PlaygroundGeneration]:
        """Return paginated history, newest first."""
        ordered = list(reversed(self._history))
        return ordered[offset : offset + limit]

    def update_generation(self, gen: PlaygroundGeneration) -> None:
        """Replace an existing generation record (matched by id) and persist."""
        for i, existing in enumerate(self._history):
            if existing.id == gen.id:
                self._history[i] = gen
                self._save_history()
                return
        logger.warning("update_generation: id %s not found", gen.id)

    def delete_generation(self, gen_id: str) -> bool:
        """Remove a generation by id. Returns True if found and deleted."""
        for i, gen in enumerate(self._history):
            if gen.id == gen_id:
                self._history.pop(i)
                self._save_history()
                return True
        return False

    # ------------------------------------------------------------------
    # Library CRUD
    # ------------------------------------------------------------------

    def list_library(
        self, limit: int = 100, offset: int = 0
    ) -> List[PlaygroundLibraryItem]:
        """Return paginated saved library items, newest first."""
        ordered = list(reversed(self._library))
        return ordered[offset : offset + limit]

    def get_library_item(self, item_id: str) -> Optional[PlaygroundLibraryItem]:
        """Look up a library item by id."""
        for item in self._library:
            if item.id == item_id:
                return item
        return None

    def get_library_item_by_source(
        self, generation_id: str, output_id: str
    ) -> Optional[PlaygroundLibraryItem]:
        """Look up a saved library item by its source generation/output."""
        for item in self._library:
            if item.generation_id == generation_id and item.output_id == output_id:
                return item
        return None

    def upsert_library_item(self, item: PlaygroundLibraryItem) -> None:
        """Add or replace a library item matched by id."""
        for i, existing in enumerate(self._library):
            if existing.id == item.id:
                self._library[i] = item
                self._save_library()
                return
        self._library.append(item)
        self._save_library()

    def delete_library_item(self, item_id: str) -> Optional[PlaygroundLibraryItem]:
        """Remove a library item by id and return it if found."""
        for i, item in enumerate(self._library):
            if item.id == item_id:
                removed = self._library.pop(i)
                self._save_library()
                return removed
        return None

    # ------------------------------------------------------------------
    # Template CRUD
    # ------------------------------------------------------------------

    def add_template(self, template: PlaygroundTemplate) -> None:
        """Append a template record and persist."""
        self._templates.append(template)
        self._save_templates()

    def get_template(self, template_id: str) -> Optional[PlaygroundTemplate]:
        """Look up a template by its id."""
        for t in self._templates:
            if t.id == template_id:
                return t
        return None

    def list_templates(self) -> List[PlaygroundTemplate]:
        """Return all templates."""
        return list(self._templates)

    def update_template(self, template: PlaygroundTemplate) -> None:
        """Replace an existing template (matched by id) and persist."""
        for i, existing in enumerate(self._templates):
            if existing.id == template.id:
                self._templates[i] = template
                self._save_templates()
                return
        logger.warning("update_template: id %s not found", template.id)

    def delete_template(self, template_id: str) -> bool:
        """Remove a template by id. Returns True if found and deleted."""
        for i, t in enumerate(self._templates):
            if t.id == template_id:
                self._templates.pop(i)
                self._save_templates()
                return True
        return False
