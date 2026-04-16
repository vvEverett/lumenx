import json
from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from src.utils.model_catalog import (
    MODEL_CATALOG_ROOT,
    build_catalog_dict,
    build_catalog_validation_report,
    build_provider_family_configs,
    get_default_model_settings,
    write_frontend_generated_catalog,
    write_generated_catalog,
)


def _write_yaml(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")


class TestModelCatalog:
    def test_repo_catalog_builds_with_phase1_compatibility_defaults_and_legacy_model_ids(self):
        catalog = build_catalog_dict(MODEL_CATALOG_ROOT)

        assert catalog["version"] == 1
        assert catalog["defaults"]["model_settings"] == {
            "t2i_model": "wan2.6-t2i",
            "i2i_model": "wan2.6-image",
            "i2v_model": "wan2.6-i2v",
        }

        models = catalog["models"]
        assert "wan2.6-t2i" in models
        assert "wan2.6-image" in models
        assert "wan2.6-i2v" in models
        assert "wan2.6-r2v" in models
        assert "kling-v3" in models
        assert "viduq3-pro" in models
        assert "pixverse-v4-i2v" in models

        assert models["wan2.6-i2v"]["ui"]["visible_in"] == [
            "project_settings",
            "series_settings",
            "video_sidebar",
            "global_settings",
        ]
        assert models["wan2.6-r2v"]["status"] == "hidden"
        assert models["wan2.6-r2v"]["ui"]["visible_in"] == []

    def test_repo_catalog_emits_additive_mode_aware_sections(self):
        catalog = build_catalog_dict(MODEL_CATALOG_ROOT)

        assert "model_lines" in catalog
        assert "modes" in catalog
        assert "compat" in catalog
        assert "legacy_model_ids" in catalog["compat"]

        assert "wan2.6-i2v" in catalog["models"]
        assert "wan2.6-r2v" in catalog["models"]
        assert "wan/wan2.6-video" in catalog["model_lines"]
        assert "wan/wan2.6-video#i2v" in catalog["modes"]
        assert "wan/wan2.6-video#r2v" in catalog["modes"]
        assert catalog["compat"]["legacy_model_ids"]["wan2.6-i2v"] == "wan/wan2.6-video#i2v"
        assert catalog["compat"]["legacy_model_ids"]["wan2.6-r2v"] == "wan/wan2.6-video#r2v"

    def test_mode_runtime_gateway_metadata_is_additive_and_routing_stays_family_based(self):
        catalog = build_catalog_dict(MODEL_CATALOG_ROOT)

        canonical_mode_id = catalog["compat"]["legacy_model_ids"]["wan2.6-r2v"]
        assert catalog["modes"][canonical_mode_id]["runtime"]["dashscope"]["gateway"] == "dashscope"

        family_configs = build_provider_family_configs(catalog)
        family_map = {config.model_family: config for config in family_configs}
        assert family_map["wan2.6-"].backend_default == "dashscope"

    def test_visible_models_must_link_to_context_hub_docs(self):
        catalog = build_catalog_dict(MODEL_CATALOG_ROOT)

        for model_id, model in catalog["models"].items():
            visible_in = model["ui"].get("visible_in", [])
            if visible_in:
                assert model["docs"]["context_hub_doc_ids"], model_id

    def test_generated_catalog_is_deterministic(self, tmp_path):
        first = tmp_path / "catalog-a.json"
        second = tmp_path / "catalog-b.json"

        write_generated_catalog(first, catalog_root=MODEL_CATALOG_ROOT)
        write_generated_catalog(second, catalog_root=MODEL_CATALOG_ROOT)

        assert first.read_text(encoding="utf-8") == second.read_text(encoding="utf-8")

    def test_frontend_generated_catalog_matches_backend_catalog(self, tmp_path):
        frontend_catalog_path = tmp_path / "frontend" / "src" / "generated" / "modelCatalog.json"

        written_path = write_frontend_generated_catalog(
            frontend_catalog_path,
            catalog_root=MODEL_CATALOG_ROOT,
        )

        assert written_path == frontend_catalog_path
        assert frontend_catalog_path.exists()
        assert build_catalog_dict(MODEL_CATALOG_ROOT) == json.loads(
            frontend_catalog_path.read_text(encoding="utf-8")
        )

    def test_catalog_derives_provider_family_configs(self):
        catalog = build_catalog_dict(MODEL_CATALOG_ROOT)
        family_configs = build_provider_family_configs(catalog)
        family_map = {config.model_family: config for config in family_configs}

        assert "wan2.6-" in family_map
        assert "wan2.5-" in family_map
        assert "wan2.2-" in family_map
        assert "kling-" in family_map
        assert "vidu" in family_map
        assert "pixverse-" in family_map

        assert family_map["kling-"].backend_env_key == "KLING_PROVIDER_MODE"
        assert family_map["vidu"].backend_env_key == "VIDU_PROVIDER_MODE"
        assert family_map["pixverse-"].backend_env_key == "PIXVERSE_PROVIDER_MODE"

    def test_default_model_settings_come_from_catalog(self):
        defaults = get_default_model_settings(MODEL_CATALOG_ROOT)

        assert defaults.t2i_model == "wan2.6-t2i"
        assert defaults.i2i_model == "wan2.6-image"
        assert defaults.i2v_model == "wan2.6-i2v"

    def test_validation_report_passes_for_repo_catalog(self):
        catalog = build_catalog_dict(MODEL_CATALOG_ROOT)

        report = build_catalog_validation_report(catalog, deepcopy(catalog))

        assert report.ok is True
        assert report.errors == ()
        assert report.stats["defaults"]["t2i_model"] == "wan2.6-t2i"
        assert report.stats["surface_summary"]["video_sidebar"]["i2v"]

    def test_validation_report_detects_frontend_catalog_drift(self):
        catalog = build_catalog_dict(MODEL_CATALOG_ROOT)
        frontend_catalog = deepcopy(catalog)
        frontend_catalog["defaults"]["model_settings"]["i2v_model"] = "wan2.5-i2v-preview"

        report = build_catalog_validation_report(catalog, frontend_catalog)

        assert report.ok is False
        assert any("Frontend generated catalog does not match" in error for error in report.errors)

    def test_validation_report_detects_default_visibility_regression(self):
        catalog = build_catalog_dict(MODEL_CATALOG_ROOT)
        broken_catalog = deepcopy(catalog)
        broken_catalog["models"]["wan2.6-i2v"]["ui"]["visible_in"] = [
            "project_settings",
            "series_settings",
            "global_settings",
        ]

        report = build_catalog_validation_report(broken_catalog, deepcopy(broken_catalog))

        assert report.ok is False
        assert any("video_sidebar" in error for error in report.errors)


class TestModelCatalogValidation:
    def test_duplicate_model_ids_fail_validation(self, tmp_path):
        _write_yaml(
            tmp_path / "catalog.meta.yaml",
            {
                "version": 1,
                "defaults": {
                    "model_settings": {
                        "t2i_model": "wan2.6-t2i",
                        "i2i_model": "wan2.6-image",
                        "i2v_model": "wan2.6-i2v",
                    }
                },
            },
        )
        _write_yaml(
            tmp_path / "families" / "wan.yaml",
            {
                "family": "wan",
                "provider": "aliyun",
                "routing_prefixes": ["wan2.6-"],
                "supported_backends": ["dashscope"],
                "default_backend": "dashscope",
                "credential_sources": {"dashscope": ["DASHSCOPE_API_KEY"]},
                "supported_modalities": ["t2i", "i2i", "i2v", "r2v"],
                "transport": {
                    "image_input_mode": {"dashscope": "dashscope_multimodal_message"},
                    "audio_input_mode": {"dashscope": "dashscope_temp_file_url"},
                    "reference_video_input_mode": {"dashscope": "dashscope_temp_file_url"},
                },
                "docs": {"official_snapshot_ids": ["aliyun/wan/2026-04-03"]},
                "models": [
                    {
                        "id": "wan2.6-t2i",
                        "display_name": "Wan 2.6 T2I",
                        "description": "Latest T2I model",
                        "status": "active",
                        "release_stage": "stable",
                        "capabilities": ["t2i"],
                        "docs": {"context_hub_doc_ids": ["aliyun/wan-t2i"]},
                        "ui": {"selection_group": "t2i", "visible_in": ["project_settings"]},
                    },
                    {
                        "id": "wan2.6-t2i",
                        "display_name": "Wan 2.6 T2I Duplicate",
                        "description": "Duplicate",
                        "status": "active",
                        "release_stage": "stable",
                        "capabilities": ["t2i"],
                        "docs": {"context_hub_doc_ids": ["aliyun/wan-t2i"]},
                        "ui": {"selection_group": "t2i", "visible_in": ["project_settings"]},
                    },
                ],
            },
        )

        with pytest.raises(ValueError, match="Duplicate model id"):
            build_catalog_dict(tmp_path)

    def test_unsupported_backend_name_fails_validation(self, tmp_path):
        _write_yaml(
            tmp_path / "catalog.meta.yaml",
            {
                "version": 1,
                "defaults": {
                    "model_settings": {
                        "t2i_model": "wan2.6-t2i",
                        "i2i_model": "wan2.6-image",
                        "i2v_model": "wan2.6-i2v",
                    }
                },
            },
        )
        _write_yaml(
            tmp_path / "families" / "broken.yaml",
            {
                "family": "broken",
                "provider": "example",
                "routing_prefixes": ["broken-"],
                "supported_backends": ["dashscope", "mystery"],
                "default_backend": "dashscope",
                "credential_sources": {"dashscope": ["DASHSCOPE_API_KEY"]},
                "supported_modalities": ["i2v"],
                "transport": {
                    "image_input_mode": {"dashscope": "dashscope_image_to_video"},
                    "audio_input_mode": {"dashscope": "dashscope_temp_file_url"},
                    "reference_video_input_mode": {"dashscope": "dashscope_temp_file_url"},
                },
                "docs": {"official_snapshot_ids": ["example/broken/2026-04-03"]},
                "models": [
                    {
                        "id": "broken-v1",
                        "display_name": "Broken v1",
                        "description": "Invalid backend example",
                        "status": "active",
                        "release_stage": "stable",
                        "capabilities": ["i2v"],
                        "docs": {"context_hub_doc_ids": ["example/broken"]},
                        "ui": {"selection_group": "i2v", "visible_in": ["video_sidebar"]},
                    }
                ],
            },
        )

        with pytest.raises(ValueError, match="Unsupported backend"):
            build_catalog_dict(tmp_path)
