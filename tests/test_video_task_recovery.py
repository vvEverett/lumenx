"""Studio video-task resilience tests.

Covers the three regressions surfaced by the "stuck on 排队中..." user
report:

  1. Backend restart eats in-memory FastAPI BackgroundTasks. The persisted
     task on disk stays at status="pending" forever and the UI shows an
     eternal spinner. Fix: pipeline.__init__ runs _recover_orphan_tasks()
     which marks pending/processing video tasks as failed with a clear
     reason, so the existing Retry button becomes usable.

  2. BG task wrapper in api.py used to silently log + drop exceptions
     that escaped pipeline.process_video_task's own try/except (e.g.
     get_script raising). The user saw nothing. Fix: a new
     pipeline.mark_video_task_failed helper writes status + error so the
     UI gets a definite failure.

  3. The user can end up with model="wan2.7-r2v" cached in
     localStorage but submit through the I2V flow without supplying ref
     images, which made wanx.py raise mid-generation. Fix:
     create_video_task validates model⇄refs consistency at submit time
     so the frontend gets a clean 400 instead of a permanently-failed
     task.
"""

import time
import uuid
from unittest.mock import patch

import pytest

from src.apps.comic_gen.models import Script, VideoTask
from src.apps.comic_gen.pipeline import ComicGenPipeline


@pytest.fixture
def pipeline(tmp_path):
    """Pipeline with temp data files, real IO bypassed."""
    with patch("src.apps.comic_gen.pipeline.ScriptProcessor"), \
         patch("src.apps.comic_gen.pipeline.AssetGenerator"), \
         patch("src.apps.comic_gen.pipeline.StoryboardGenerator"), \
         patch("src.apps.comic_gen.pipeline.VideoGenerator"), \
         patch("src.apps.comic_gen.pipeline.AudioGenerator"), \
         patch("src.apps.comic_gen.pipeline.ExportManager"):
        p = ComicGenPipeline()
    p.data_file = str(tmp_path / "projects.json")
    p.series_data_file = str(tmp_path / "series.json")
    p.scripts = {}
    p.series_store = {}
    return p


def _video_task(status="pending", task_id=None) -> VideoTask:
    return VideoTask(
        id=task_id or str(uuid.uuid4()),
        project_id="p1",
        image_url="uploads/img.png",
        prompt="prompt",
        status=status,
        model="wan2.7-i2v",
    )


def _script_with_tasks(*tasks) -> Script:
    return Script(
        id="p1",
        title="Project",
        original_text="text",
        created_at=time.time(),
        updated_at=time.time(),
        video_tasks=list(tasks),
    )


# ---------------------------------------------------------------------------
# Orphan recovery
# ---------------------------------------------------------------------------


def test_orphan_recovery_marks_pending_and_processing_as_failed(pipeline):
    """Pending/processing tasks left over from a prior process die in
    mid-air when uvicorn restarts. _recover_orphan_tasks stamps them
    failed so the UI's Retry path is reachable."""
    pending = _video_task(status="pending", task_id="t-pending")
    processing = _video_task(status="processing", task_id="t-processing")
    completed = _video_task(status="completed", task_id="t-completed")
    failed = _video_task(status="failed", task_id="t-failed")
    pipeline.scripts = {
        "p1": _script_with_tasks(pending, processing, completed, failed),
    }

    pipeline._recover_orphan_tasks()

    by_id = {t.id: t for t in pipeline.scripts["p1"].video_tasks}
    assert by_id["t-pending"].status == "failed"
    assert "Backend was restarted" in (by_id["t-pending"].error or "")
    assert by_id["t-processing"].status == "failed"
    # Completed + failed are untouched.
    assert by_id["t-completed"].status == "completed"
    assert by_id["t-failed"].status == "failed"


def test_orphan_recovery_preserves_existing_error_message(pipeline):
    """If a stuck task already has an error message attached, the
    recovery sweep doesn't overwrite it (preserves diagnostic value)."""
    task = _video_task(status="pending", task_id="t1")
    task.error = "DashScope provider timed out"
    pipeline.scripts = {"p1": _script_with_tasks(task)}

    pipeline._recover_orphan_tasks()

    recovered = pipeline.scripts["p1"].video_tasks[0]
    assert recovered.status == "failed"
    assert recovered.error == "DashScope provider timed out"


def test_orphan_recovery_is_noop_when_nothing_stuck(pipeline):
    pipeline.scripts = {
        "p1": _script_with_tasks(_video_task(status="completed")),
    }

    pipeline._recover_orphan_tasks()  # Should not raise

    # No save side-effect needed (recovered count was zero).
    assert pipeline.scripts["p1"].video_tasks[0].status == "completed"


# ---------------------------------------------------------------------------
# mark_video_task_failed (belt-and-suspenders writeback)
# ---------------------------------------------------------------------------


def test_mark_video_task_failed_writes_status_and_error(pipeline):
    task = _video_task(status="processing", task_id="t1")
    pipeline.scripts = {"p1": _script_with_tasks(task)}

    ok = pipeline.mark_video_task_failed("p1", "t1", "Background error: boom")

    assert ok is True
    after = pipeline.scripts["p1"].video_tasks[0]
    assert after.status == "failed"
    assert after.error == "Background error: boom"


def test_mark_video_task_failed_does_not_downgrade_completed(pipeline):
    """A spurious wrapper exception or a late cancel must not flip a
    successful task back to failed."""
    task = _video_task(status="completed", task_id="t1")
    pipeline.scripts = {"p1": _script_with_tasks(task)}

    ok = pipeline.mark_video_task_failed("p1", "t1", "spurious")

    assert ok is False
    assert pipeline.scripts["p1"].video_tasks[0].status == "completed"


def test_mark_video_task_failed_returns_false_for_unknown(pipeline):
    pipeline.scripts = {"p1": _script_with_tasks(_video_task(task_id="t1"))}

    assert pipeline.mark_video_task_failed("p1", "nope", "x") is False
    assert pipeline.mark_video_task_failed("nope", "t1", "x") is False


# ---------------------------------------------------------------------------
# create_video_task: model ⇄ ref consistency guard (Bug C)
# ---------------------------------------------------------------------------


def test_create_video_task_rejects_r2v_model_without_refs(pipeline):
    """The user reproduced this: stale localStorage carried wan2.7-r2v
    into an I2V flow that never supplies ref images. Without the guard
    wanx.py raises mid-flight and the user sees only a spinner."""
    pipeline.scripts = {"p1": _script_with_tasks()}

    with pytest.raises(ValueError, match="reference-to-video"):
        pipeline.create_video_task(
            script_id="p1",
            image_url="uploads/img.png",
            prompt="A scene",
            model="wan2.7-r2v",
            generation_mode="i2v",   # mismatched against the model
            reference_image_urls=[],
        )

    # Task was never persisted.
    assert pipeline.scripts["p1"].video_tasks == []


def test_create_video_task_rejects_wan26_r2v_without_video_refs(pipeline):
    pipeline.scripts = {"p1": _script_with_tasks()}

    with pytest.raises(ValueError, match="reference-to-video"):
        pipeline.create_video_task(
            script_id="p1",
            image_url="",
            prompt="A scene",
            model="wan2.6-r2v",
            generation_mode="r2v",
            reference_video_urls=[],
        )


def test_create_video_task_accepts_r2v_with_refs(pipeline):
    pipeline.scripts = {"p1": _script_with_tasks()}
    # Avoid touching disk for snapshot copy.
    with patch.object(pipeline, "_save_data"):
        # The snapshot copy logic also touches the filesystem; route a
        # bogus URL through the http branch by setting a non-existent
        # path so the function early-skips the snapshot but still
        # creates the task.
        script, task_id = pipeline.create_video_task(
            script_id="p1",
            image_url="http://example.com/img.png",
            prompt="A scene",
            model="wan2.7-r2v",
            generation_mode="r2v",
            reference_image_urls=["http://example.com/ref1.png"],
        )

    assert task_id
    assert any(t.id == task_id for t in script.video_tasks)
