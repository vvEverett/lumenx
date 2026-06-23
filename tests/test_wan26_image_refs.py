import base64

import requests

from src.models.image import WanxImageModel


PNG_1X1_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+"
    "X2VINQAAAABJRU5ErkJggg=="
)


class TestWan26ImageLocalReferenceFallback:
    def test_local_reference_image_uses_base64_payload_without_oss(self, monkeypatch, tmp_path):
        ref_path = tmp_path / "reference.png"
        ref_path.write_bytes(base64.b64decode(PNG_1X1_BASE64))

        captured_payload = {}

        class FakeUploader:
            def __init__(self):
                self.is_configured = False

        class FakeCreateResponse:
            status_code = 200
            text = (
                '{"request_id":"req-1","output":{"task_id":"task-1","task_status":"PENDING"}}'
            )

            def json(self):
                return {
                    "request_id": "req-1",
                    "output": {"task_id": "task-1", "task_status": "PENDING"},
                }

        class FakePollResponse:
            status_code = 200

            def json(self):
                return {
                    "output": {
                        "task_status": "SUCCEEDED",
                        "choices": [
                            {
                                "message": {
                                    "content": [{"image": "https://example.com/generated.png"}]
                                }
                            }
                        ],
                    }
                }

        def fake_post(url, headers=None, json=None, timeout=None):
            captured_payload["json"] = json
            return FakeCreateResponse()

        def fake_get(url, headers=None, timeout=None):
            return FakePollResponse()

        monkeypatch.setattr("src.models.image.OSSImageUploader", FakeUploader)
        monkeypatch.setattr("src.models.image.get_provider_base_url", lambda _: "https://dashscope.test")
        monkeypatch.setattr(requests, "post", fake_post)
        monkeypatch.setattr(requests, "get", fake_get)
        monkeypatch.setattr("time.sleep", lambda _: None)

        model = WanxImageModel({"params": {"i2i_model_name": "wan2.6-image"}})

        image_url = model._generate_wan26_image_http(
            prompt="keep the same character",
            size="1280*1280",
            n=1,
            negative_prompt="bad anatomy",
            ref_image_paths=[str(ref_path)],
        )

        assert image_url == "https://example.com/generated.png"

        content = captured_payload["json"]["input"]["messages"][0]["content"]
        image_entries = [item for item in content if "image" in item]

        assert len(image_entries) == 1
        assert image_entries[0]["image"].startswith("data:image/png;base64,")
        assert content[-1]["text"] == "keep the same character"


class TestQwenImageHttp:
    def test_generate_dispatches_qwen_image_to_sync_multimodal_api(self, monkeypatch, tmp_path):
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        captured = {}

        def fake_qwen_call(
            self,
            prompt,
            model_name,
            size="1280*1280",
            n=1,
            negative_prompt=None,
            ref_image_paths=None,
            seed=None,
            prompt_extend=True,
            watermark=False,
        ):
            captured["prompt"] = prompt
            captured["model_name"] = model_name
            captured["size"] = size
            captured["seed"] = seed
            return "https://example.com/qwen.png"

        def fail_async_call(self, *args, **kwargs):
            raise AssertionError("qwen-image must not use the async image-generation API")

        monkeypatch.setattr(WanxImageModel, "_generate_qwen_image_http", fake_qwen_call)
        monkeypatch.setattr(WanxImageModel, "_generate_dashscope_image_http", fail_async_call)
        monkeypatch.setattr(WanxImageModel, "_download_image", lambda self, *_: None)

        model = WanxImageModel({})
        model.generate(
            prompt="render a title card",
            output_path=str(tmp_path / "out.png"),
            model_name="qwen-image-2.0-pro",
            size="2048*2048",
            seed=0,
        )

        assert captured == {
            "prompt": "render a title card",
            "model_name": "qwen-image-2.0-pro",
            "size": "2048*2048",
            "seed": 0,
        }

    def test_qwen_image_sync_call_uses_multimodal_generation_payload(self, monkeypatch):
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        captured = {}

        class FakeResponse:
            status_code = 200
            text = '{"output":{"choices":[{"message":{"content":[{"image":"https://example.com/out.png"}]}}]}}'

            def json(self):
                return {
                    "output": {
                        "choices": [
                            {
                                "message": {
                                    "content": [{"image": "https://example.com/out.png"}]
                                }
                            }
                        ]
                    }
                }

        def fake_post(url, headers=None, json=None, timeout=None):
            captured["url"] = url
            captured["headers"] = dict(headers or {})
            captured["json"] = json
            captured["timeout"] = timeout
            return FakeResponse()

        monkeypatch.setattr("src.models.image.get_provider_base_url", lambda _: "https://dashscope.test")
        monkeypatch.setattr(requests, "post", fake_post)

        model = WanxImageModel({})
        image_url = model._generate_qwen_image_http(
            prompt="render a title card",
            model_name="qwen-image-2.0-pro",
            size="2048*2048",
            n=1,
            negative_prompt="low quality",
            seed=0,
        )

        assert image_url == "https://example.com/out.png"
        assert captured["url"] == (
            "https://dashscope.test/api/v1/services/aigc/"
            "multimodal-generation/generation"
        )
        assert "X-DashScope-Async" not in captured["headers"]
        assert captured["headers"]["Authorization"] == "Bearer test-key"

        payload = captured["json"]
        assert payload["model"] == "qwen-image-2.0-pro"
        assert payload["input"]["messages"] == [
            {
                "role": "user",
                "content": [{"text": "render a title card"}],
            }
        ]
        assert payload["parameters"]["size"] == "2048*2048"
        assert payload["parameters"]["negative_prompt"] == "low quality"
        assert payload["parameters"]["seed"] == 0
